CREATE INDEX "scheduling_booking_unredacted_end_idx" ON "scheduling_booking" USING btree ("end_at") WHERE "scheduling_booking"."redacted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "scheduling_claim_occupied_end_idx" ON "scheduling_claim" USING btree ("occupied_end");--> statement-breakpoint
CREATE INDEX "scheduling_claim_live_until_idx" ON "scheduling_claim" USING btree ("live_until") WHERE "scheduling_claim"."live_until" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "scheduling_group_session_end_at_idx" ON "scheduling_group_session" USING btree ("end_at");--> statement-breakpoint
CREATE INDEX "scheduling_series_created_at_idx" ON "scheduling_series" USING btree ("created_at");