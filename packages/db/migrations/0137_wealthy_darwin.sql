ALTER TYPE "public"."scheduling_notification_channel" ADD VALUE 'webhook';--> statement-breakpoint
ALTER TYPE "public"."scheduling_notification_recipient" ADD VALUE 'endpoint';--> statement-breakpoint
ALTER TYPE "public"."scheduling_notification_recipient" ADD VALUE 'address';--> statement-breakpoint
CREATE TABLE "scheduling_reminder_sync" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"environment_id" text NOT NULL,
	"event_type_id" text,
	"cursor_start_at" timestamp with time zone,
	"cursor_booking_id" text,
	"lease_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scheduling_event_type" ADD COLUMN "reminders" jsonb;--> statement-breakpoint
ALTER TABLE "scheduling_host" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "scheduling_notification" ADD COLUMN "reminder_key" text;--> statement-breakpoint
ALTER TABLE "scheduling_notification" ADD COLUMN "reminder_anchor" text;--> statement-breakpoint
ALTER TABLE "scheduling_notification" ADD COLUMN "reminder_offset_minutes" integer;--> statement-breakpoint
ALTER TABLE "scheduling_notification" ADD COLUMN "anchor_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "scheduling_settings" ADD COLUMN "email_reply_to" text;--> statement-breakpoint
ALTER TABLE "scheduling_settings" ADD COLUMN "reminders" jsonb;--> statement-breakpoint
ALTER TABLE "scheduling_reminder_sync" ADD CONSTRAINT "scheduling_reminder_sync_environment_fk" FOREIGN KEY ("environment_id","organization_id") REFERENCES "public"."environment"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_reminder_sync" ADD CONSTRAINT "scheduling_reminder_sync_event_type_fk" FOREIGN KEY ("event_type_id","organization_id") REFERENCES "public"."scheduling_event_type"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scheduling_reminder_sync_environment_idx" ON "scheduling_reminder_sync" USING btree ("environment_id");