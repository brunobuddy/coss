CREATE TYPE "public"."scheduling_booking_status" AS ENUM('held', 'pending_approval', 'confirmed', 'cancelled', 'declined');--> statement-breakpoint
CREATE TYPE "public"."scheduling_calendar_event_state" AS ENUM('present', 'absent');--> statement-breakpoint
CREATE TYPE "public"."scheduling_calendar_failure_mode" AS ENUM('hide', 'last_known');--> statement-breakpoint
CREATE TYPE "public"."scheduling_calendar_provider" AS ENUM('google', 'microsoft', 'caldav', 'simulated');--> statement-breakpoint
CREATE TYPE "public"."scheduling_connection_status" AS ENUM('active', 'needs_reauth');--> statement-breakpoint
CREATE TYPE "public"."scheduling_event_type_kind" AS ENUM('one_on_one', 'pool', 'collective', 'group');--> statement-breakpoint
CREATE TYPE "public"."scheduling_event_type_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."scheduling_external_state" AS ENUM('in_sync', 'moved', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."scheduling_host_role" AS ENUM('required', 'member');--> statement-breakpoint
CREATE TYPE "public"."scheduling_host_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."scheduling_notification_channel" AS ENUM('email', 'sms');--> statement-breakpoint
CREATE TYPE "public"."scheduling_notification_recipient" AS ENUM('attendee', 'host');--> statement-breakpoint
CREATE TYPE "public"."scheduling_session_kind" AS ENUM('host', 'booker', 'manage');--> statement-breakpoint
CREATE TABLE "scheduling_attendee" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"environment_id" text NOT NULL,
	"booking_id" text NOT NULL,
	"uid" text,
	"encrypted_contact" text,
	"email_hmac" text,
	"encrypted_answers" text,
	"time_zone" text NOT NULL,
	"locale" text,
	"redacted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduling_booking" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"environment_id" text NOT NULL,
	"event_type_id" text NOT NULL,
	"status" "scheduling_booking_status" NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"title" text NOT NULL,
	"buffer_before_minutes" integer NOT NULL,
	"buffer_after_minutes" integer NOT NULL,
	"location" jsonb,
	"hold_expires_at" timestamp with time zone,
	"approval_expires_at" timestamp with time zone,
	"series_id" text,
	"series_index" integer,
	"group_session_id" text,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"idempotency_key" text,
	"request_hash" text,
	"usage_recorded_at" timestamp with time zone,
	"calendar_unverified" boolean DEFAULT false NOT NULL,
	"external_conflict_at" timestamp with time zone,
	"no_show_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"redacted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduling_booking_id_organization_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "scheduling_booking_environment_idempotency_unique" UNIQUE("environment_id","idempotency_key"),
	CONSTRAINT "scheduling_booking_time_order" CHECK ("scheduling_booking"."start_at" < "scheduling_booking"."end_at"),
	CONSTRAINT "scheduling_booking_hold_has_expiry" CHECK ("scheduling_booking"."status" <> 'held' OR "scheduling_booking"."hold_expires_at" IS NOT NULL),
	CONSTRAINT "scheduling_booking_approval_has_expiry" CHECK ("scheduling_booking"."status" <> 'pending_approval' OR "scheduling_booking"."approval_expires_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "scheduling_booking_event" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"booking_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"type" text NOT NULL,
	"actor" jsonb NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduling_booking_event_sequence_unique" UNIQUE("booking_id","sequence")
);
--> statement-breakpoint
CREATE TABLE "scheduling_booking_host" (
	"booking_id" text NOT NULL,
	"host_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"role" "scheduling_host_role" DEFAULT 'member' NOT NULL,
	CONSTRAINT "scheduling_booking_host_booking_id_host_id_pk" PRIMARY KEY("booking_id","host_id")
);
--> statement-breakpoint
CREATE TABLE "scheduling_busy_interval" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"calendar_id" text NOT NULL,
	"host_id" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduling_calendar" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"environment_id" text NOT NULL,
	"host_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"external_id" text NOT NULL,
	"read_busy" boolean DEFAULT true NOT NULL,
	"write_target" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"covered_until" timestamp with time zone,
	"dirty_at" timestamp with time zone,
	"last_fetch_started_at" timestamp with time zone,
	"next_sync_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone,
	"sync_failures" integer DEFAULT 0 NOT NULL,
	"channel_id" text,
	"channel_resource_id" text,
	"channel_token_hash" text,
	"channel_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduling_calendar_id_organization_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "scheduling_calendar_connection_external_unique" UNIQUE("connection_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "scheduling_calendar_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"environment_id" text NOT NULL,
	"host_id" text NOT NULL,
	"provider" "scheduling_calendar_provider" NOT NULL,
	"account_id" text NOT NULL,
	"encrypted_credentials" text,
	"status" "scheduling_connection_status" DEFAULT 'active' NOT NULL,
	"last_error_code" text,
	"last_error_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduling_calendar_connection_id_organization_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "scheduling_calendar_connection_account_unique" UNIQUE("host_id","provider","account_id")
);
--> statement-breakpoint
CREATE TABLE "scheduling_calendar_event" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"environment_id" text NOT NULL,
	"booking_id" text NOT NULL,
	"host_id" text NOT NULL,
	"calendar_id" text NOT NULL,
	"desired_start" timestamp with time zone NOT NULL,
	"desired_end" timestamp with time zone NOT NULL,
	"desired_state" "scheduling_calendar_event_state" DEFAULT 'present' NOT NULL,
	"desired_version" integer DEFAULT 1 NOT NULL,
	"applied_version" integer DEFAULT 0 NOT NULL,
	"provider_event_id" text,
	"external_state" "scheduling_external_state" DEFAULT 'in_sync' NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduling_calendar_event_target_unique" UNIQUE("booking_id","host_id","calendar_id")
);
--> statement-breakpoint
CREATE TABLE "scheduling_claim" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"environment_id" text NOT NULL,
	"host_id" text NOT NULL,
	"event_type_id" text NOT NULL,
	"booking_id" text,
	"group_session_id" text,
	"occupied_start" timestamp with time zone NOT NULL,
	"occupied_end" timestamp with time zone NOT NULL,
	"live_from" timestamp with time zone NOT NULL,
	"live_until" timestamp with time zone,
	"limit_day" date NOT NULL,
	"limit_week" date NOT NULL,
	CONSTRAINT "scheduling_claim_occupied_order" CHECK ("scheduling_claim"."occupied_start" < "scheduling_claim"."occupied_end"),
	CONSTRAINT "scheduling_claim_live_order" CHECK ("scheduling_claim"."live_until" IS NULL OR "scheduling_claim"."live_from" < "scheduling_claim"."live_until"),
	CONSTRAINT "scheduling_claim_one_owner" CHECK (("scheduling_claim"."booking_id" IS NULL) <> ("scheduling_claim"."group_session_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "scheduling_event_type" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"environment_id" text NOT NULL,
	"uid" text,
	"title" text NOT NULL,
	"kind" "scheduling_event_type_kind" DEFAULT 'one_on_one' NOT NULL,
	"status" "scheduling_event_type_status" DEFAULT 'active' NOT NULL,
	"duration_minutes" integer NOT NULL,
	"duration_options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"step_minutes" integer NOT NULL,
	"grid_time_zone" text,
	"buffer_before_minutes" integer DEFAULT 0 NOT NULL,
	"buffer_after_minutes" integer DEFAULT 0 NOT NULL,
	"min_notice_minutes" integer DEFAULT 0 NOT NULL,
	"booking_window" jsonb,
	"limits" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"capacity" integer,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"approval_ttl_minutes" integer DEFAULT 1440 NOT NULL,
	"hold_ttl_seconds" integer DEFAULT 600 NOT NULL,
	"cancel_notice_minutes" integer DEFAULT 0 NOT NULL,
	"reschedule_notice_minutes" integer DEFAULT 0 NOT NULL,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"locations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"host_filter" jsonb,
	"notifications" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"screened_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduling_event_type_environment_uid_unique" UNIQUE("environment_id","uid"),
	CONSTRAINT "scheduling_event_type_id_organization_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "scheduling_event_type_duration_positive" CHECK ("scheduling_event_type"."duration_minutes" > 0),
	CONSTRAINT "scheduling_event_type_step_positive" CHECK ("scheduling_event_type"."step_minutes" > 0),
	CONSTRAINT "scheduling_event_type_capacity" CHECK ("scheduling_event_type"."capacity" IS NULL OR ("scheduling_event_type"."kind" = 'group' AND "scheduling_event_type"."capacity" > 0))
);
--> statement-breakpoint
CREATE TABLE "scheduling_event_type_host" (
	"event_type_id" text NOT NULL,
	"host_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"role" "scheduling_host_role" DEFAULT 'member' NOT NULL,
	"weight" integer DEFAULT 100 NOT NULL,
	"fair_units" integer DEFAULT 0 NOT NULL,
	"last_assigned_at" timestamp with time zone,
	"schedule_id" text,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduling_event_type_host_event_type_id_host_id_pk" PRIMARY KEY("event_type_id","host_id"),
	CONSTRAINT "scheduling_event_type_host_weight_positive" CHECK ("scheduling_event_type_host"."weight" > 0)
);
--> statement-breakpoint
CREATE TABLE "scheduling_group_session" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"environment_id" text NOT NULL,
	"event_type_id" text NOT NULL,
	"host_id" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"capacity" integer NOT NULL,
	"usage_recorded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduling_group_session_id_organization_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "scheduling_group_session_slot_unique" UNIQUE("event_type_id","host_id","start_at")
);
--> statement-breakpoint
CREATE TABLE "scheduling_host" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"environment_id" text NOT NULL,
	"uid" text,
	"name" text NOT NULL,
	"email" text,
	"time_zone" text NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "scheduling_host_status" DEFAULT 'active' NOT NULL,
	"screened_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduling_host_environment_uid_unique" UNIQUE("environment_id","uid"),
	CONSTRAINT "scheduling_host_id_organization_unique" UNIQUE("id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "scheduling_limit_bucket" (
	"organization_id" text NOT NULL,
	"scope" text NOT NULL,
	"scope_id" text NOT NULL,
	"period" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduling_limit_bucket_scope_scope_id_period_pk" PRIMARY KEY("scope","scope_id","period")
);
--> statement-breakpoint
CREATE TABLE "scheduling_notification" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"environment_id" text NOT NULL,
	"booking_id" text,
	"host_id" text,
	"kind" text NOT NULL,
	"channel" "scheduling_notification_channel" NOT NULL,
	"recipient" "scheduling_notification_recipient" NOT NULL,
	"booking_version" integer,
	"dedupe_key" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"lease_until" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"finished_at" timestamp with time zone,
	"outcome" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduling_notification_dedupe_unique" UNIQUE("environment_id","dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "scheduling_oauth_state" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"environment_id" text NOT NULL,
	"host_id" text NOT NULL,
	"provider" "scheduling_calendar_provider" NOT NULL,
	"state_hash" text NOT NULL,
	"encrypted_code_verifier" text NOT NULL,
	"return_url" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduling_oauth_state_hash_unique" UNIQUE("state_hash")
);
--> statement-breakpoint
CREATE TABLE "scheduling_schedule" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"environment_id" text NOT NULL,
	"host_id" text NOT NULL,
	"name" text NOT NULL,
	"time_zone" text NOT NULL,
	"rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduling_schedule_id_organization_unique" UNIQUE("id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "scheduling_schedule_override" (
	"schedule_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"date" date NOT NULL,
	"ranges" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "scheduling_schedule_override_schedule_id_date_pk" PRIMARY KEY("schedule_id","date")
);
--> statement-breakpoint
CREATE TABLE "scheduling_series" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"environment_id" text NOT NULL,
	"event_type_id" text NOT NULL,
	"rule" jsonb NOT NULL,
	"anchor_time_zone" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduling_series_id_organization_unique" UNIQUE("id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "scheduling_session" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"environment_id" text NOT NULL,
	"kind" "scheduling_session_kind" NOT NULL,
	"token_hash" text NOT NULL,
	"host_id" text,
	"event_type_id" text,
	"booking_id" text,
	"encrypted_attendee" text,
	"read_only" boolean DEFAULT false NOT NULL,
	"api_key_id" text,
	"created_by_user_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduling_session_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "scheduling_session_scope" CHECK (("scheduling_session"."kind" = 'host' AND "scheduling_session"."host_id" IS NOT NULL)
        OR ("scheduling_session"."kind" = 'booker' AND ("scheduling_session"."event_type_id" IS NOT NULL OR "scheduling_session"."host_id" IS NOT NULL))
        OR ("scheduling_session"."kind" = 'manage' AND "scheduling_session"."booking_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "scheduling_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"environment_id" text NOT NULL,
	"allowed_origins" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"brand_name" text,
	"accent_color" text,
	"email_from" text,
	"sms_from" text,
	"notifications" jsonb,
	"calendar_failure_mode" "scheduling_calendar_failure_mode" DEFAULT 'hide' NOT NULL,
	"screened_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduling_settings_environment_unique" UNIQUE("environment_id")
);
--> statement-breakpoint
ALTER TABLE "scheduling_attendee" ADD CONSTRAINT "scheduling_attendee_booking_fk" FOREIGN KEY ("booking_id","organization_id") REFERENCES "public"."scheduling_booking"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_booking" ADD CONSTRAINT "scheduling_booking_environment_fk" FOREIGN KEY ("environment_id","organization_id") REFERENCES "public"."environment"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_booking" ADD CONSTRAINT "scheduling_booking_event_type_fk" FOREIGN KEY ("event_type_id","organization_id") REFERENCES "public"."scheduling_event_type"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_booking" ADD CONSTRAINT "scheduling_booking_series_fk" FOREIGN KEY ("series_id","organization_id") REFERENCES "public"."scheduling_series"("id","organization_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_booking" ADD CONSTRAINT "scheduling_booking_group_session_fk" FOREIGN KEY ("group_session_id","organization_id") REFERENCES "public"."scheduling_group_session"("id","organization_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_booking_event" ADD CONSTRAINT "scheduling_booking_event_booking_fk" FOREIGN KEY ("booking_id","organization_id") REFERENCES "public"."scheduling_booking"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_booking_host" ADD CONSTRAINT "scheduling_booking_host_booking_fk" FOREIGN KEY ("booking_id","organization_id") REFERENCES "public"."scheduling_booking"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_booking_host" ADD CONSTRAINT "scheduling_booking_host_host_fk" FOREIGN KEY ("host_id","organization_id") REFERENCES "public"."scheduling_host"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_busy_interval" ADD CONSTRAINT "scheduling_busy_interval_calendar_fk" FOREIGN KEY ("calendar_id","organization_id") REFERENCES "public"."scheduling_calendar"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_calendar" ADD CONSTRAINT "scheduling_calendar_connection_fk" FOREIGN KEY ("connection_id","organization_id") REFERENCES "public"."scheduling_calendar_connection"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_calendar_connection" ADD CONSTRAINT "scheduling_calendar_connection_host_fk" FOREIGN KEY ("host_id","organization_id") REFERENCES "public"."scheduling_host"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_calendar_event" ADD CONSTRAINT "scheduling_calendar_event_booking_fk" FOREIGN KEY ("booking_id","organization_id") REFERENCES "public"."scheduling_booking"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_calendar_event" ADD CONSTRAINT "scheduling_calendar_event_calendar_fk" FOREIGN KEY ("calendar_id","organization_id") REFERENCES "public"."scheduling_calendar"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_claim" ADD CONSTRAINT "scheduling_claim_host_fk" FOREIGN KEY ("host_id","organization_id") REFERENCES "public"."scheduling_host"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_claim" ADD CONSTRAINT "scheduling_claim_booking_fk" FOREIGN KEY ("booking_id","organization_id") REFERENCES "public"."scheduling_booking"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_claim" ADD CONSTRAINT "scheduling_claim_group_session_fk" FOREIGN KEY ("group_session_id","organization_id") REFERENCES "public"."scheduling_group_session"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_event_type" ADD CONSTRAINT "scheduling_event_type_environment_fk" FOREIGN KEY ("environment_id","organization_id") REFERENCES "public"."environment"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_event_type_host" ADD CONSTRAINT "scheduling_event_type_host_event_type_fk" FOREIGN KEY ("event_type_id","organization_id") REFERENCES "public"."scheduling_event_type"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_event_type_host" ADD CONSTRAINT "scheduling_event_type_host_host_fk" FOREIGN KEY ("host_id","organization_id") REFERENCES "public"."scheduling_host"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_group_session" ADD CONSTRAINT "scheduling_group_session_event_type_fk" FOREIGN KEY ("event_type_id","organization_id") REFERENCES "public"."scheduling_event_type"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_group_session" ADD CONSTRAINT "scheduling_group_session_host_fk" FOREIGN KEY ("host_id","organization_id") REFERENCES "public"."scheduling_host"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_host" ADD CONSTRAINT "scheduling_host_environment_fk" FOREIGN KEY ("environment_id","organization_id") REFERENCES "public"."environment"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_notification" ADD CONSTRAINT "scheduling_notification_environment_fk" FOREIGN KEY ("environment_id","organization_id") REFERENCES "public"."environment"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_notification" ADD CONSTRAINT "scheduling_notification_booking_fk" FOREIGN KEY ("booking_id","organization_id") REFERENCES "public"."scheduling_booking"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_oauth_state" ADD CONSTRAINT "scheduling_oauth_state_host_fk" FOREIGN KEY ("host_id","organization_id") REFERENCES "public"."scheduling_host"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_schedule" ADD CONSTRAINT "scheduling_schedule_host_fk" FOREIGN KEY ("host_id","organization_id") REFERENCES "public"."scheduling_host"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_schedule_override" ADD CONSTRAINT "scheduling_schedule_override_schedule_fk" FOREIGN KEY ("schedule_id","organization_id") REFERENCES "public"."scheduling_schedule"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_series" ADD CONSTRAINT "scheduling_series_event_type_fk" FOREIGN KEY ("event_type_id","organization_id") REFERENCES "public"."scheduling_event_type"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_session" ADD CONSTRAINT "scheduling_session_environment_fk" FOREIGN KEY ("environment_id","organization_id") REFERENCES "public"."environment"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_session" ADD CONSTRAINT "scheduling_session_host_fk" FOREIGN KEY ("host_id","organization_id") REFERENCES "public"."scheduling_host"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_session" ADD CONSTRAINT "scheduling_session_event_type_fk" FOREIGN KEY ("event_type_id","organization_id") REFERENCES "public"."scheduling_event_type"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_session" ADD CONSTRAINT "scheduling_session_booking_fk" FOREIGN KEY ("booking_id","organization_id") REFERENCES "public"."scheduling_booking"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_settings" ADD CONSTRAINT "scheduling_settings_environment_fk" FOREIGN KEY ("environment_id","organization_id") REFERENCES "public"."environment"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scheduling_attendee_booking_idx" ON "scheduling_attendee" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "scheduling_attendee_environment_uid_idx" ON "scheduling_attendee" USING btree ("environment_id","uid");--> statement-breakpoint
CREATE INDEX "scheduling_attendee_environment_email_idx" ON "scheduling_attendee" USING btree ("environment_id","email_hmac");--> statement-breakpoint
CREATE INDEX "scheduling_booking_environment_start_idx" ON "scheduling_booking" USING btree ("environment_id","start_at","id");--> statement-breakpoint
CREATE INDEX "scheduling_booking_event_type_start_idx" ON "scheduling_booking" USING btree ("event_type_id","start_at");--> statement-breakpoint
CREATE INDEX "scheduling_booking_series_idx" ON "scheduling_booking" USING btree ("series_id","series_index");--> statement-breakpoint
CREATE INDEX "scheduling_booking_group_session_idx" ON "scheduling_booking" USING btree ("group_session_id");--> statement-breakpoint
CREATE INDEX "scheduling_booking_end_idx" ON "scheduling_booking" USING btree ("end_at");--> statement-breakpoint
CREATE INDEX "scheduling_booking_hold_expiry_idx" ON "scheduling_booking" USING btree ("hold_expires_at") WHERE "scheduling_booking"."status" = 'held';--> statement-breakpoint
CREATE INDEX "scheduling_booking_approval_expiry_idx" ON "scheduling_booking" USING btree ("approval_expires_at") WHERE "scheduling_booking"."status" = 'pending_approval';--> statement-breakpoint
CREATE INDEX "scheduling_booking_host_host_idx" ON "scheduling_booking_host" USING btree ("host_id");--> statement-breakpoint
CREATE INDEX "scheduling_busy_interval_host_idx" ON "scheduling_busy_interval" USING btree ("host_id","end_at","start_at");--> statement-breakpoint
CREATE INDEX "scheduling_busy_interval_calendar_idx" ON "scheduling_busy_interval" USING btree ("calendar_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scheduling_calendar_host_write_target_unique" ON "scheduling_calendar" USING btree ("host_id") WHERE "scheduling_calendar"."write_target";--> statement-breakpoint
CREATE INDEX "scheduling_calendar_host_idx" ON "scheduling_calendar" USING btree ("host_id");--> statement-breakpoint
CREATE INDEX "scheduling_calendar_channel_idx" ON "scheduling_calendar" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "scheduling_calendar_next_sync_idx" ON "scheduling_calendar" USING btree ("next_sync_at");--> statement-breakpoint
CREATE INDEX "scheduling_calendar_event_host_idx" ON "scheduling_calendar_event" USING btree ("host_id","desired_end","desired_start");--> statement-breakpoint
CREATE INDEX "scheduling_calendar_event_due_idx" ON "scheduling_calendar_event" USING btree ("next_attempt_at") WHERE "scheduling_calendar_event"."applied_version" < "scheduling_calendar_event"."desired_version";--> statement-breakpoint
CREATE INDEX "scheduling_claim_booking_idx" ON "scheduling_claim" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "scheduling_claim_group_session_idx" ON "scheduling_claim" USING btree ("group_session_id");--> statement-breakpoint
CREATE INDEX "scheduling_claim_host_day_idx" ON "scheduling_claim" USING btree ("host_id","limit_day");--> statement-breakpoint
CREATE INDEX "scheduling_claim_host_week_idx" ON "scheduling_claim" USING btree ("host_id","limit_week");--> statement-breakpoint
CREATE INDEX "scheduling_event_type_environment_created_at_idx" ON "scheduling_event_type" USING btree ("environment_id","created_at","id");--> statement-breakpoint
CREATE INDEX "scheduling_event_type_host_host_idx" ON "scheduling_event_type_host" USING btree ("host_id");--> statement-breakpoint
CREATE INDEX "scheduling_host_environment_created_at_idx" ON "scheduling_host" USING btree ("environment_id","created_at","id");--> statement-breakpoint
CREATE INDEX "scheduling_host_attributes_idx" ON "scheduling_host" USING gin ("attributes" jsonb_path_ops);--> statement-breakpoint
CREATE INDEX "scheduling_limit_bucket_organization_idx" ON "scheduling_limit_bucket" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "scheduling_limit_bucket_created_at_idx" ON "scheduling_limit_bucket" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "scheduling_notification_due_idx" ON "scheduling_notification" USING btree ("due_at") WHERE "scheduling_notification"."finished_at" IS NULL;--> statement-breakpoint
CREATE INDEX "scheduling_notification_booking_idx" ON "scheduling_notification" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "scheduling_oauth_state_expires_at_idx" ON "scheduling_oauth_state" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "scheduling_schedule_host_default_unique" ON "scheduling_schedule" USING btree ("host_id") WHERE "scheduling_schedule"."is_default";--> statement-breakpoint
CREATE INDEX "scheduling_schedule_host_idx" ON "scheduling_schedule" USING btree ("host_id");--> statement-breakpoint
CREATE INDEX "scheduling_series_environment_idx" ON "scheduling_series" USING btree ("environment_id","created_at");--> statement-breakpoint
CREATE INDEX "scheduling_session_expires_at_idx" ON "scheduling_session" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "scheduling_session_booking_idx" ON "scheduling_session" USING btree ("booking_id");