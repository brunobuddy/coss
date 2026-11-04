ALTER TABLE "scheduling_holiday_calendar" ADD COLUMN "regions" jsonb;--> statement-breakpoint
ALTER TABLE "scheduling_public_holiday" ADD COLUMN "region" text;