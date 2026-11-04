CREATE TYPE "public"."scheduling_out_of_office_source" AS ENUM('api', 'host', 'manager', 'dashboard', 'holiday');--> statement-breakpoint
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
	"source" "scheduling_out_of_office_source" NOT NULL,
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
ALTER TABLE "scheduling_calendar_event" DROP CONSTRAINT "scheduling_calendar_event_one_owner";--> statement-breakpoint
ALTER TABLE "scheduling_calendar_event" ADD COLUMN "out_of_office_id" text;--> statement-breakpoint
ALTER TABLE "scheduling_settings" ADD COLUMN "out_of_office_reasons" jsonb;--> statement-breakpoint
ALTER TABLE "scheduling_out_of_office" ADD CONSTRAINT "scheduling_out_of_office_host_fk" FOREIGN KEY ("host_id","organization_id") REFERENCES "public"."scheduling_host"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_out_of_office" ADD CONSTRAINT "scheduling_out_of_office_environment_fk" FOREIGN KEY ("environment_id","organization_id") REFERENCES "public"."environment"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "scheduling_out_of_office_external_id_idx" ON "scheduling_out_of_office" USING btree ("environment_id","external_id") WHERE "scheduling_out_of_office"."external_id" IS NOT NULL AND "scheduling_out_of_office"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "scheduling_out_of_office_host_idx" ON "scheduling_out_of_office" USING btree ("host_id","end_at","start_at") WHERE "scheduling_out_of_office"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "scheduling_out_of_office_environment_idx" ON "scheduling_out_of_office" USING btree ("environment_id","id");--> statement-breakpoint
CREATE INDEX "scheduling_out_of_office_unannounced_start_idx" ON "scheduling_out_of_office" USING btree ("start_at") WHERE "scheduling_out_of_office"."announced_start_at" IS NULL AND "scheduling_out_of_office"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "scheduling_out_of_office_unannounced_end_idx" ON "scheduling_out_of_office" USING btree ("end_at") WHERE "scheduling_out_of_office"."announced_end_at" IS NULL AND "scheduling_out_of_office"."deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "scheduling_calendar_event" ADD CONSTRAINT "scheduling_calendar_event_out_of_office_fk" FOREIGN KEY ("out_of_office_id","organization_id") REFERENCES "public"."scheduling_out_of_office"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_calendar_event" ADD CONSTRAINT "scheduling_calendar_event_out_of_office_target_unique" UNIQUE("out_of_office_id","host_id","calendar_id");--> statement-breakpoint
ALTER TABLE "scheduling_calendar_event" ADD CONSTRAINT "scheduling_calendar_event_one_owner" CHECK (num_nonnulls("scheduling_calendar_event"."booking_id", "scheduling_calendar_event"."group_session_id", "scheduling_calendar_event"."out_of_office_id") = 1);