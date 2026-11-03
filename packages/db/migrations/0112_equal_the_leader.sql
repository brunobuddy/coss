ALTER TYPE "public"."log_source" ADD VALUE 'scheduling';--> statement-breakpoint
ALTER TABLE "scheduling_series" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "scheduling_series" ADD COLUMN "request_hash" text;--> statement-breakpoint
ALTER TABLE "scheduling_series" ADD CONSTRAINT "scheduling_series_environment_idempotency_unique" UNIQUE("environment_id","idempotency_key");