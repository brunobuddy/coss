ALTER TYPE "public"."scheduling_session_kind" ADD VALUE 'manager';--> statement-breakpoint
ALTER TABLE "scheduling_session" DROP CONSTRAINT "scheduling_session_scope";--> statement-breakpoint
ALTER TABLE "scheduling_session" ADD COLUMN "manager_host_ids" jsonb;--> statement-breakpoint
ALTER TABLE "scheduling_session" ADD COLUMN "manager_host_filter" jsonb;--> statement-breakpoint
ALTER TABLE "scheduling_settings" ADD COLUMN "host_reassignment" text DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE "scheduling_session" ADD CONSTRAINT "scheduling_session_scope" CHECK (("scheduling_session"."kind" = 'host' AND "scheduling_session"."host_id" IS NOT NULL)
        OR ("scheduling_session"."kind" = 'booker' AND ("scheduling_session"."event_type_id" IS NOT NULL OR "scheduling_session"."host_id" IS NOT NULL))
        OR ("scheduling_session"."kind" = 'manage' AND "scheduling_session"."booking_id" IS NOT NULL)
        OR ("scheduling_session"."kind"::text = 'manager' AND ("scheduling_session"."manager_host_ids" IS NOT NULL OR "scheduling_session"."manager_host_filter" IS NOT NULL)));