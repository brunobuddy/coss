-- A plain SET NULL would null `organization_id` too, which the row can't do without.
ALTER TABLE "scheduling_booking" DROP CONSTRAINT "scheduling_booking_group_session_fk";--> statement-breakpoint
ALTER TABLE "scheduling_booking" ADD CONSTRAINT "scheduling_booking_group_session_fk" FOREIGN KEY ("group_session_id","organization_id") REFERENCES "public"."scheduling_group_session"("id","organization_id") ON DELETE SET NULL ("group_session_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_booking" DROP CONSTRAINT "scheduling_booking_series_fk";--> statement-breakpoint
ALTER TABLE "scheduling_booking" ADD CONSTRAINT "scheduling_booking_series_fk" FOREIGN KEY ("series_id","organization_id") REFERENCES "public"."scheduling_series"("id","organization_id") ON DELETE SET NULL ("series_id") ON UPDATE no action;
