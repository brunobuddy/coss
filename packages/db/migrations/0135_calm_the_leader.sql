ALTER TABLE "scheduling_host" ADD COLUMN "next_fee_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "scheduling_host_next_fee_at_idx" ON "scheduling_host" USING btree ("next_fee_at") WHERE "scheduling_host"."next_fee_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "scheduling_host_live_organization_idx" ON "scheduling_host" USING btree ("organization_id") WHERE "scheduling_host"."next_fee_at" IS NOT NULL;--> statement-breakpoint
-- Hosts that already exist are charged from when the meter is first priced.
UPDATE "scheduling_host" SET "next_fee_at" = '2027-01-01T00:00:00Z' FROM "environment" WHERE "environment"."id" = "scheduling_host"."environment_id" AND "environment"."mode" = 'live';
