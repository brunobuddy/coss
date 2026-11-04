CREATE TYPE "public"."scheduling_out_of_office_existing" AS ENUM('leave', 'reassign');--> statement-breakpoint
CREATE TYPE "public"."scheduling_reassignment_host_notice" AS ENUM('digest', 'each', 'none');--> statement-breakpoint
CREATE TYPE "public"."scheduling_reassignment_outcome" AS ENUM('pending', 'reassigned', 'skipped_changed', 'no_candidate', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."scheduling_reassignment_status" AS ENUM('pending', 'running', 'completed', 'cancelled');--> statement-breakpoint
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
ALTER TABLE "scheduling_notification" ADD COLUMN "reassignment_id" text;--> statement-breakpoint
ALTER TABLE "scheduling_out_of_office" ADD COLUMN "existing_bookings" "scheduling_out_of_office_existing" DEFAULT 'leave' NOT NULL;--> statement-breakpoint
ALTER TABLE "scheduling_out_of_office" ADD COLUMN "reassign_strategy" jsonb;--> statement-breakpoint
ALTER TABLE "scheduling_reassignment" ADD CONSTRAINT "scheduling_reassignment_environment_fk" FOREIGN KEY ("environment_id","organization_id") REFERENCES "public"."environment"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_reassignment_item" ADD CONSTRAINT "scheduling_reassignment_item_reassignment_fk" FOREIGN KEY ("reassignment_id","organization_id") REFERENCES "public"."scheduling_reassignment"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_reassignment_item" ADD CONSTRAINT "scheduling_reassignment_item_booking_fk" FOREIGN KEY ("booking_id","organization_id") REFERENCES "public"."scheduling_booking"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scheduling_reassignment_environment_idx" ON "scheduling_reassignment" USING btree ("environment_id","id");--> statement-breakpoint
CREATE INDEX "scheduling_reassignment_due_idx" ON "scheduling_reassignment" USING btree ("created_at") WHERE "scheduling_reassignment"."status" IN ('pending', 'running');--> statement-breakpoint
CREATE INDEX "scheduling_reassignment_created_at_idx" ON "scheduling_reassignment" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "scheduling_reassignment_item_pending_idx" ON "scheduling_reassignment_item" USING btree ("reassignment_id","start_at","id") WHERE "scheduling_reassignment_item"."outcome" = 'pending';--> statement-breakpoint
CREATE INDEX "scheduling_reassignment_item_booking_idx" ON "scheduling_reassignment_item" USING btree ("booking_id");