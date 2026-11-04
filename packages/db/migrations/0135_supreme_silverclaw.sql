CREATE TYPE "public"."scheduling_out_of_office_existing" AS ENUM('leave', 'reassign');--> statement-breakpoint
CREATE TYPE "public"."scheduling_out_of_office_source" AS ENUM('api', 'host', 'manager', 'dashboard', 'holiday');--> statement-breakpoint
CREATE TYPE "public"."scheduling_reassignment_host_notice" AS ENUM('digest', 'each', 'none');--> statement-breakpoint
CREATE TYPE "public"."scheduling_reassignment_outcome" AS ENUM('pending', 'reassigned', 'skipped_changed', 'no_candidate', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."scheduling_reassignment_status" AS ENUM('pending', 'running', 'completed', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."scheduling_session_kind" ADD VALUE 'manager';--> statement-breakpoint
CREATE TABLE "scheduling_holiday_calendar" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"environment_id" text NOT NULL,
	"name" text NOT NULL,
	"country_code" text,
	"encrypted_ics_url" text,
	"holidays" jsonb,
	"regions" jsonb,
	"host_ids" jsonb,
	"host_filter" jsonb,
	"delegate_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"existing_bookings" "scheduling_out_of_office_existing" DEFAULT 'leave' NOT NULL,
	"last_read_at" timestamp with time zone,
	"last_error" text,
	"settings_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"next_sync_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduling_out_of_office" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"environment_id" text NOT NULL,
	"host_id" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"start_date" date,
	"end_date" date,
	"all_day_zone" text,
	"reason" text DEFAULT 'unspecified' NOT NULL,
	"encrypted_notes" text,
	"public_message" text,
	"show_on_calendar" boolean DEFAULT true NOT NULL,
	"existing_bookings" "scheduling_out_of_office_existing" DEFAULT 'leave' NOT NULL,
	"reassign_strategy" jsonb,
	"source" "scheduling_out_of_office_source" NOT NULL,
	"source_key" text,
	"external_id" text,
	"group_id" text,
	"announced_start_at" timestamp with time zone,
	"announced_end_at" timestamp with time zone,
	"fairness_leveled_at" timestamp with time zone,
	"actor" jsonb NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduling_out_of_office_id_organization_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "scheduling_out_of_office_span" CHECK ("scheduling_out_of_office"."start_at" < "scheduling_out_of_office"."end_at")
);
--> statement-breakpoint
CREATE TABLE "scheduling_out_of_office_delegate" (
	"out_of_office_id" text NOT NULL,
	"host_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "scheduling_out_of_office_delegate_pk" PRIMARY KEY("out_of_office_id","host_id")
);
--> statement-breakpoint
CREATE TABLE "scheduling_public_holiday" (
	"country_code" text NOT NULL,
	"date" text NOT NULL,
	"name" text NOT NULL,
	"region" text,
	CONSTRAINT "scheduling_public_holiday_pk" PRIMARY KEY("country_code","date")
);
--> statement-breakpoint
CREATE TABLE "scheduling_public_holiday_source" (
	"country_code" text PRIMARY KEY NOT NULL,
	"read_at" timestamp with time zone,
	"next_read_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduling_reassignment" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"environment_id" text NOT NULL,
	"status" "scheduling_reassignment_status" DEFAULT 'pending' NOT NULL,
	"selection" jsonb NOT NULL,
	"strategy" jsonb NOT NULL,
	"reason_code" text NOT NULL,
	"encrypted_note" text,
	"overrides" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notify_attendees" boolean DEFAULT true NOT NULL,
	"notify_hosts" "scheduling_reassignment_host_notice" DEFAULT 'digest' NOT NULL,
	"out_of_office_id" text,
	"undo_of_id" text,
	"actor" jsonb NOT NULL,
	"idempotency_key" text,
	"request_hash" text,
	"lease_until" timestamp with time zone,
	"expanded_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduling_reassignment_id_organization_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "scheduling_reassignment_idempotency_unique" UNIQUE("environment_id","idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "scheduling_reassignment_item" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"reassignment_id" text NOT NULL,
	"booking_id" text NOT NULL,
	"from_host_id" text,
	"to_host_id" text,
	"series_id" text,
	"start_at" timestamp with time zone NOT NULL,
	"outcome" "scheduling_reassignment_outcome" DEFAULT 'pending' NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduling_reassignment_item_booking_unique" UNIQUE("reassignment_id","booking_id")
);
--> statement-breakpoint
ALTER TABLE "scheduling_calendar_event" DROP CONSTRAINT "scheduling_calendar_event_one_owner";--> statement-breakpoint
ALTER TABLE "scheduling_session" DROP CONSTRAINT "scheduling_session_scope";--> statement-breakpoint
ALTER TABLE "scheduling_booking" ADD COLUMN "encrypted_attributes" text;--> statement-breakpoint
ALTER TABLE "scheduling_booking_event" ADD COLUMN "encrypted_note" text;--> statement-breakpoint
ALTER TABLE "scheduling_calendar_event" ADD COLUMN "out_of_office_id" text;--> statement-breakpoint
ALTER TABLE "scheduling_calendar_event" ADD COLUMN "key_generation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "scheduling_event_type" ADD COLUMN "reassignment_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "scheduling_notification" ADD COLUMN "reassignment_id" text;--> statement-breakpoint
ALTER TABLE "scheduling_session" ADD COLUMN "manager_host_ids" jsonb;--> statement-breakpoint
ALTER TABLE "scheduling_session" ADD COLUMN "manager_host_filter" jsonb;--> statement-breakpoint
ALTER TABLE "scheduling_settings" ADD COLUMN "out_of_office_reasons" jsonb;--> statement-breakpoint
ALTER TABLE "scheduling_settings" ADD COLUMN "name_host_in_attendee_emails" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "scheduling_settings" ADD COLUMN "host_reassignment" text DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE "scheduling_holiday_calendar" ADD CONSTRAINT "scheduling_holiday_calendar_environment_fk" FOREIGN KEY ("environment_id","organization_id") REFERENCES "public"."environment"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_out_of_office" ADD CONSTRAINT "scheduling_out_of_office_host_fk" FOREIGN KEY ("host_id","organization_id") REFERENCES "public"."scheduling_host"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_out_of_office" ADD CONSTRAINT "scheduling_out_of_office_environment_fk" FOREIGN KEY ("environment_id","organization_id") REFERENCES "public"."environment"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_out_of_office_delegate" ADD CONSTRAINT "scheduling_out_of_office_delegate_entry_fk" FOREIGN KEY ("out_of_office_id","organization_id") REFERENCES "public"."scheduling_out_of_office"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_out_of_office_delegate" ADD CONSTRAINT "scheduling_out_of_office_delegate_host_fk" FOREIGN KEY ("host_id","organization_id") REFERENCES "public"."scheduling_host"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_reassignment" ADD CONSTRAINT "scheduling_reassignment_environment_fk" FOREIGN KEY ("environment_id","organization_id") REFERENCES "public"."environment"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_reassignment_item" ADD CONSTRAINT "scheduling_reassignment_item_reassignment_fk" FOREIGN KEY ("reassignment_id","organization_id") REFERENCES "public"."scheduling_reassignment"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_reassignment_item" ADD CONSTRAINT "scheduling_reassignment_item_booking_fk" FOREIGN KEY ("booking_id","organization_id") REFERENCES "public"."scheduling_booking"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scheduling_holiday_calendar_environment_idx" ON "scheduling_holiday_calendar" USING btree ("environment_id","name");--> statement-breakpoint
CREATE INDEX "scheduling_holiday_calendar_due_idx" ON "scheduling_holiday_calendar" USING btree ("next_sync_at");--> statement-breakpoint
CREATE UNIQUE INDEX "scheduling_out_of_office_source_key_idx" ON "scheduling_out_of_office" USING btree ("environment_id","source_key") WHERE "scheduling_out_of_office"."source_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "scheduling_out_of_office_external_id_idx" ON "scheduling_out_of_office" USING btree ("environment_id","external_id") WHERE "scheduling_out_of_office"."external_id" IS NOT NULL AND "scheduling_out_of_office"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "scheduling_out_of_office_host_idx" ON "scheduling_out_of_office" USING btree ("host_id","end_at","start_at") WHERE "scheduling_out_of_office"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "scheduling_out_of_office_environment_idx" ON "scheduling_out_of_office" USING btree ("environment_id","id");--> statement-breakpoint
CREATE INDEX "scheduling_out_of_office_unannounced_start_idx" ON "scheduling_out_of_office" USING btree ("start_at") WHERE "scheduling_out_of_office"."announced_start_at" IS NULL AND "scheduling_out_of_office"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "scheduling_out_of_office_unannounced_end_idx" ON "scheduling_out_of_office" USING btree ("end_at") WHERE "scheduling_out_of_office"."announced_end_at" IS NULL AND "scheduling_out_of_office"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "scheduling_out_of_office_delegate_host_idx" ON "scheduling_out_of_office_delegate" USING btree ("host_id");--> statement-breakpoint
CREATE INDEX "scheduling_reassignment_environment_idx" ON "scheduling_reassignment" USING btree ("environment_id","id");--> statement-breakpoint
CREATE INDEX "scheduling_reassignment_due_idx" ON "scheduling_reassignment" USING btree ("created_at") WHERE "scheduling_reassignment"."status" IN ('pending', 'running');--> statement-breakpoint
CREATE INDEX "scheduling_reassignment_created_at_idx" ON "scheduling_reassignment" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "scheduling_reassignment_item_pending_idx" ON "scheduling_reassignment_item" USING btree ("reassignment_id","start_at","id") WHERE "scheduling_reassignment_item"."outcome" = 'pending';--> statement-breakpoint
CREATE INDEX "scheduling_reassignment_item_booking_idx" ON "scheduling_reassignment_item" USING btree ("booking_id");--> statement-breakpoint
ALTER TABLE "scheduling_calendar_event" ADD CONSTRAINT "scheduling_calendar_event_out_of_office_fk" FOREIGN KEY ("out_of_office_id","organization_id") REFERENCES "public"."scheduling_out_of_office"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_calendar_event" ADD CONSTRAINT "scheduling_calendar_event_out_of_office_target_unique" UNIQUE("out_of_office_id","host_id","calendar_id");--> statement-breakpoint
ALTER TABLE "scheduling_calendar_event" ADD CONSTRAINT "scheduling_calendar_event_one_owner" CHECK (num_nonnulls("scheduling_calendar_event"."booking_id", "scheduling_calendar_event"."group_session_id", "scheduling_calendar_event"."out_of_office_id") = 1);--> statement-breakpoint
ALTER TABLE "scheduling_session" ADD CONSTRAINT "scheduling_session_scope" CHECK (("scheduling_session"."kind" = 'host' AND "scheduling_session"."host_id" IS NOT NULL)
        OR ("scheduling_session"."kind" = 'booker' AND ("scheduling_session"."event_type_id" IS NOT NULL OR "scheduling_session"."host_id" IS NOT NULL))
        OR ("scheduling_session"."kind" = 'manage' AND "scheduling_session"."booking_id" IS NOT NULL)
        OR ("scheduling_session"."kind"::text = 'manager' AND ("scheduling_session"."manager_host_ids" IS NOT NULL OR "scheduling_session"."manager_host_filter" IS NOT NULL)));