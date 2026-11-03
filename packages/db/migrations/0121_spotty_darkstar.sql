ALTER TABLE "scheduling_event_type_host" ADD COLUMN "assigned" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "scheduling_session" ADD COLUMN "encrypted_attributes" text;