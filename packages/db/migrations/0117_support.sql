CREATE TYPE "public"."support_attachment_state" AS ENUM('uploaded', 'pending_copy', 'stored', 'failed');--> statement-breakpoint
CREATE TYPE "public"."support_delivery_status" AS ENUM('pending', 'accepted', 'delivered', 'bounced', 'failed');--> statement-breakpoint
CREATE TYPE "public"."support_message_kind" AS ENUM('customer', 'agent', 'note', 'event');--> statement-breakpoint
CREATE TYPE "public"."support_org_match" AS ENUM('session', 'email', 'manual');--> statement-breakpoint
CREATE TYPE "public"."support_sender_auth" AS ENUM('session', 'dmarc_pass', 'unverified');--> statement-breakpoint
CREATE TYPE "public"."support_severity" AS ENUM('normal', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."support_ticket_source" AS ENUM('email', 'dashboard');--> statement-breakpoint
CREATE TYPE "public"."support_ticket_status" AS ENUM('open', 'pending', 'snoozed', 'resolved', 'spam');--> statement-breakpoint
CREATE TABLE "support_attachment" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text,
	"message_id" text,
	"uploaded_by_user_id" text,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size" bigint NOT NULL,
	"state" "support_attachment_state" NOT NULL,
	"source_key" text,
	"store_key" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_fake_object" (
	"key" text PRIMARY KEY NOT NULL,
	"content_type" text NOT NULL,
	"content" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_intake" (
	"received_email_id" text PRIMARY KEY NOT NULL,
	"outcome" text,
	"ticket_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"last_error" text,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_message" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"kind" "support_message_kind" NOT NULL,
	"event" text,
	"event_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"author_user_id" text,
	"author_name" text,
	"author_email" text,
	"body" text DEFAULT '' NOT NULL,
	"visible_text" text DEFAULT '' NOT NULL,
	"sender_auth" "support_sender_auth",
	"customer_visible" boolean DEFAULT false NOT NULL,
	"low_signal" boolean DEFAULT false NOT NULL,
	"rfc_message_id" text,
	"received_email_id" text,
	"email_id" text,
	"delivery_status" "support_delivery_status",
	"delivery_attempts" integer DEFAULT 0 NOT NULL,
	"next_delivery_at" timestamp with time zone,
	"delivery_error" text,
	"rep_alert_pending" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_saved_reply" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_ticket" (
	"id" text PRIMARY KEY NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "support_ticket_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1001 CACHE 1),
	"reply_token" text NOT NULL,
	"subject" text NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"severity" "support_severity" DEFAULT 'normal' NOT NULL,
	"status" "support_ticket_status" DEFAULT 'open' NOT NULL,
	"source" "support_ticket_source" NOT NULL,
	"filter_reason" text,
	"organization_id" text,
	"organization_name" text,
	"org_match" "support_org_match",
	"suggested_organization_id" text,
	"requester_user_id" text,
	"requester_email" text NOT NULL,
	"requester_name" text,
	"sender_auth" "support_sender_auth" NOT NULL,
	"cc" text[] DEFAULT '{}'::text[] NOT NULL,
	"suggested_cc" text[] DEFAULT '{}'::text[] NOT NULL,
	"assignee_user_id" text,
	"plan" text DEFAULT 'free' NOT NULL,
	"all_hours" boolean DEFAULT false NOT NULL,
	"awaiting_since" timestamp with time zone,
	"response_due_at" timestamp with time zone,
	"first_responded_at" timestamp with time zone,
	"breached_at" timestamp with time zone,
	"risk_alerted_due_at" timestamp with time zone,
	"breach_alerted_due_at" timestamp with time zone,
	"snoozed_until" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"last_customer_message_at" timestamp with time zone,
	"last_agent_message_at" timestamp with time zone,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_ticket_read" (
	"ticket_id" text NOT NULL,
	"user_id" text NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "support_attachment" ADD CONSTRAINT "support_attachment_ticket_id_support_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_ticket"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_attachment" ADD CONSTRAINT "support_attachment_message_id_support_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."support_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_attachment" ADD CONSTRAINT "support_attachment_uploaded_by_user_id_user_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_message" ADD CONSTRAINT "support_message_ticket_id_support_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_ticket"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_message" ADD CONSTRAINT "support_message_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_saved_reply" ADD CONSTRAINT "support_saved_reply_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket" ADD CONSTRAINT "support_ticket_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket" ADD CONSTRAINT "support_ticket_suggested_organization_id_organization_id_fk" FOREIGN KEY ("suggested_organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket" ADD CONSTRAINT "support_ticket_requester_user_id_user_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket" ADD CONSTRAINT "support_ticket_assignee_user_id_user_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_read" ADD CONSTRAINT "support_ticket_read_ticket_id_support_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_ticket"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_read" ADD CONSTRAINT "support_ticket_read_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "support_attachment_message_idx" ON "support_attachment" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "support_attachment_ticket_idx" ON "support_attachment" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "support_attachment_copy_idx" ON "support_attachment" USING btree ("next_attempt_at") WHERE "support_attachment"."state" = 'pending_copy';--> statement-breakpoint
CREATE INDEX "support_attachment_unclaimed_idx" ON "support_attachment" USING btree ("created_at") WHERE "support_attachment"."message_id" IS NULL;--> statement-breakpoint
CREATE INDEX "support_intake_created_idx" ON "support_intake" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "support_message_ticket_idx" ON "support_message" USING btree ("ticket_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "support_message_rfc_unique" ON "support_message" USING btree ("ticket_id","rfc_message_id") WHERE "support_message"."rfc_message_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "support_message_rfc_idx" ON "support_message" USING btree ("rfc_message_id") WHERE "support_message"."rfc_message_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "support_message_delivery_idx" ON "support_message" USING btree ("next_delivery_at") WHERE "support_message"."delivery_status" = 'pending';--> statement-breakpoint
CREATE INDEX "support_message_accepted_idx" ON "support_message" USING btree ("created_at") WHERE "support_message"."delivery_status" = 'accepted';--> statement-breakpoint
CREATE INDEX "support_message_alert_idx" ON "support_message" USING btree ("id") WHERE "support_message"."rep_alert_pending";--> statement-breakpoint
CREATE UNIQUE INDEX "support_saved_reply_title_unique" ON "support_saved_reply" USING btree ("title");--> statement-breakpoint
CREATE UNIQUE INDEX "support_ticket_number_unique" ON "support_ticket" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "support_ticket_reply_token_unique" ON "support_ticket" USING btree ("reply_token");--> statement-breakpoint
CREATE INDEX "support_ticket_queue_idx" ON "support_ticket" USING btree ("status","response_due_at");--> statement-breakpoint
CREATE INDEX "support_ticket_organization_idx" ON "support_ticket" USING btree ("organization_id","last_message_at");--> statement-breakpoint
CREATE INDEX "support_ticket_suggested_idx" ON "support_ticket" USING btree ("suggested_organization_id");--> statement-breakpoint
CREATE INDEX "support_ticket_requester_idx" ON "support_ticket" USING btree ("requester_email","created_at");--> statement-breakpoint
CREATE INDEX "support_ticket_requester_user_idx" ON "support_ticket" USING btree ("requester_user_id");--> statement-breakpoint
CREATE INDEX "support_ticket_assignee_idx" ON "support_ticket" USING btree ("assignee_user_id","status");--> statement-breakpoint
CREATE INDEX "support_ticket_snoozed_idx" ON "support_ticket" USING btree ("snoozed_until") WHERE "support_ticket"."snoozed_until" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "support_ticket_read_unique" ON "support_ticket_read" USING btree ("ticket_id","user_id");