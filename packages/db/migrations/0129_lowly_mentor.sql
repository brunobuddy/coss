ALTER TABLE "scheduling_booking_event" ADD COLUMN "encrypted_note" text;--> statement-breakpoint
ALTER TABLE "scheduling_event_type" ADD COLUMN "reassignment_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "scheduling_settings" ADD COLUMN "name_host_in_attendee_emails" boolean DEFAULT false NOT NULL;