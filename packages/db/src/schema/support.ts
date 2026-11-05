/**
 * coss.com's own support desk (`@coss/support`). A platform-level product: a ticket can arrive by
 * email before anyone knows whose it is, and it outlives its organization and people until
 * retention, so its organization and user references are nullable and set null on delete.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { ID_PREFIXES, newId } from "../id.ts";
import { organization, user } from "./auth.ts";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

export const supportTicketStatus = pgEnum("support_ticket_status", [
  "open",
  "pending",
  "snoozed",
  "resolved",
  "spam",
]);
export const supportSeverity = pgEnum("support_severity", ["normal", "urgent"]);
export const supportTicketSource = pgEnum("support_ticket_source", ["email", "dashboard"]);
/** How a ticket's confirmed organization was decided. */
export const supportOrgMatch = pgEnum("support_org_match", ["session", "email", "manual"]);
/** What proves a message's sender; `unverified` senders may be forged. */
export const supportSenderAuth = pgEnum("support_sender_auth", [
  "session",
  "dmarc_pass",
  "unverified",
]);
export const supportMessageKind = pgEnum("support_message_kind", [
  "customer",
  "agent",
  "note",
  "event",
]);
export const supportDeliveryStatus = pgEnum("support_delivery_status", [
  "pending",
  "accepted",
  "delivered",
  "bounced",
  "failed",
]);
export const supportAttachmentState = pgEnum("support_attachment_state", [
  "uploaded",
  "pending_copy",
  "stored",
  "failed",
]);

export type SupportTicketContext = {
  path?: string;
  environmentId?: string;
  projectName?: string;
  environmentName?: string;
  product?: string;
  resourceType?: string;
  resourceId?: string;
};

export const supportTicket = pgTable(
  "support_ticket",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.supportTicket)),
    number: integer("number").notNull().generatedAlwaysAsIdentity({ startWith: 1001 }),
    // Random: replies addressed to it reach this ticket. Lowercase, since recipients are.
    replyToken: text("reply_token").notNull(),
    subject: text("subject").notNull(),
    category: text("category").notNull().default("other"),
    severity: supportSeverity("severity").notNull().default("normal"),
    status: supportTicketStatus("status").notNull().default("open"),
    source: supportTicketSource("source").notNull(),
    // Why a ticket went to Spam: `spam`, `auto` (auto-responders, bounces) or `flood`.
    filterReason: text("filter_reason"),
    // Confirmed: controls what customers see. Suggested: a provisional match for the rep and SLA.
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "set null",
    }),
    organizationName: text("organization_name"),
    orgMatch: supportOrgMatch("org_match"),
    suggestedOrganizationId: text("suggested_organization_id").references(() => organization.id, {
      onDelete: "set null",
    }),
    requesterUserId: text("requester_user_id").references(() => user.id, { onDelete: "set null" }),
    requesterEmail: text("requester_email").notNull(),
    requesterName: text("requester_name"),
    senderAuth: supportSenderAuth("sender_auth").notNull(),
    cc: text("cc").array().notNull().default(sql`'{}'::text[]`),
    // Cc from unauthenticated mail: copied on replies only once a rep accepts them.
    suggestedCc: text("suggested_cc").array().notNull().default(sql`'{}'::text[]`),
    assigneeUserId: text("assignee_user_id").references(() => user.id, { onDelete: "set null" }),
    // The plan and clock when a customer last spoke, so the queue needs no billing reads.
    plan: text("plan").notNull().default("free"),
    allHours: boolean("all_hours").notNull().default(false),
    // Set while a customer waits for a response; null stops the clock.
    awaitingSince: timestamp("awaiting_since", { withTimezone: true }),
    responseDueAt: timestamp("response_due_at", { withTimezone: true }),
    firstRespondedAt: timestamp("first_responded_at", { withTimezone: true }),
    breachedAt: timestamp("breached_at", { withTimezone: true }),
    // The due time each alert last went out for: a new due time can alert again, once.
    riskAlertedDueAt: timestamp("risk_alerted_due_at", { withTimezone: true }),
    breachAlertedDueAt: timestamp("breach_alerted_due_at", { withTimezone: true }),
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    lastCustomerMessageAt: timestamp("last_customer_message_at", { withTimezone: true }),
    lastAgentMessageAt: timestamp("last_agent_message_at", { withTimezone: true }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    context: jsonb("context").$type<SupportTicketContext>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("support_ticket_number_unique").on(t.number),
    uniqueIndex("support_ticket_reply_token_unique").on(t.replyToken),
    index("support_ticket_queue_idx").on(t.status, t.responseDueAt),
    index("support_ticket_organization_idx").on(t.organizationId, t.lastMessageAt),
    index("support_ticket_suggested_idx").on(t.suggestedOrganizationId),
    index("support_ticket_requester_idx").on(t.requesterEmail, t.createdAt),
    index("support_ticket_requester_user_idx").on(t.requesterUserId),
    index("support_ticket_assignee_idx").on(t.assigneeUserId, t.status),
    index("support_ticket_snoozed_idx")
      .on(t.snoozedUntil)
      .where(sql`${t.snoozedUntil} IS NOT NULL`),
  ],
);

export const supportMessage = pgTable(
  "support_message",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.supportMessage)),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => supportTicket.id, { onDelete: "cascade" }),
    kind: supportMessageKind("kind").notNull(),
    // For `event` rows: what happened (`resolved`, `assigned`, `acknowledged`, …) and its details.
    event: text("event"),
    eventData: jsonb("event_data").$type<Record<string, unknown>>().notNull().default({}),
    authorUserId: text("author_user_id").references(() => user.id, { onDelete: "set null" }),
    authorName: text("author_name"),
    authorEmail: text("author_email"),
    body: text("body").notNull().default(""),
    // The new part of an email, without quoted history; `body` keeps the whole text.
    visibleText: text("visible_text").notNull().default(""),
    senderAuth: supportSenderAuth("sender_auth"),
    // Notes, internal events and messages from unverified senders stay false.
    customerVisible: boolean("customer_visible").notNull().default(false),
    // Auto-responders and spam on an existing ticket: filed, without reopening or alerting.
    lowSignal: boolean("low_signal").notNull().default(false),
    // Plain references with no FK: they outlive the received email and email purges.
    rfcMessageId: text("rfc_message_id"),
    receivedEmailId: text("received_email_id"),
    emailId: text("email_id"),
    deliveryStatus: supportDeliveryStatus("delivery_status"),
    deliveryAttempts: integer("delivery_attempts").notNull().default(0),
    nextDeliveryAt: timestamp("next_delivery_at", { withTimezone: true }),
    deliveryError: text("delivery_error"),
    repAlertPending: boolean("rep_alert_pending").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index("support_message_ticket_idx").on(t.ticketId, t.id),
    uniqueIndex("support_message_rfc_unique")
      .on(t.ticketId, t.rfcMessageId)
      .where(sql`${t.rfcMessageId} IS NOT NULL`),
    index("support_message_rfc_idx").on(t.rfcMessageId).where(sql`${t.rfcMessageId} IS NOT NULL`),
    index("support_message_delivery_idx")
      .on(t.nextDeliveryAt)
      .where(sql`${t.deliveryStatus} = 'pending'`),
    index("support_message_accepted_idx")
      .on(t.createdAt)
      .where(sql`${t.deliveryStatus} = 'accepted'`),
    index("support_message_alert_idx").on(t.id).where(sql`${t.repAlertPending}`),
  ],
);

export const supportAttachment = pgTable(
  "support_attachment",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.supportAttachment)),
    // Null while an upload waits for the message it is sent with.
    ticketId: text("ticket_id").references(() => supportTicket.id, { onDelete: "cascade" }),
    messageId: text("message_id").references(() => supportMessage.id, { onDelete: "cascade" }),
    uploadedByUserId: text("uploaded_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    state: supportAttachmentState("state").notNull(),
    // Where a received attachment's bytes wait to be copied from (they expire there).
    sourceKey: text("source_key"),
    storeKey: text("store_key").notNull(),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("support_attachment_message_idx").on(t.messageId),
    index("support_attachment_ticket_idx").on(t.ticketId),
    index("support_attachment_copy_idx")
      .on(t.nextAttemptAt)
      .where(sql`${t.state} = 'pending_copy'`),
    index("support_attachment_unclaimed_idx").on(t.createdAt).where(sql`${t.messageId} IS NULL`),
  ],
);

/** One row per received email the intake has looked at; a settled row is never looked at again. */
export const supportIntake = pgTable(
  "support_intake",
  {
    receivedEmailId: text("received_email_id").primaryKey(),
    outcome: text("outcome"),
    ticketId: text("ticket_id"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    lastError: text("last_error"),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("support_intake_created_idx").on(t.createdAt)],
);

export const supportSavedReply = pgTable(
  "support_saved_reply",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId(ID_PREFIXES.supportSavedReply)),
    title: text("title").notNull(),
    body: text("body").notNull(),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("support_saved_reply_title_unique").on(t.title)],
);

/** When each person last read a ticket: what makes it unread for them. */
export const supportTicketRead = pgTable(
  "support_ticket_read",
  {
    ticketId: text("ticket_id")
      .notNull()
      .references(() => supportTicket.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("support_ticket_read_unique").on(t.ticketId, t.userId)],
);

/** The fake attachment store (development and tests); S3 in production. */
export const supportFakeObject = pgTable("support_fake_object", {
  key: text("key").primaryKey(),
  contentType: text("content_type").notNull(),
  content: bytea("content").notNull(),
  createdAt: createdAt(),
});
