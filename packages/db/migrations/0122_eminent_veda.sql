ALTER TABLE "scheduling_calendar_event" ALTER COLUMN "booking_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "scheduling_calendar_event" ADD COLUMN "group_session_id" text;--> statement-breakpoint
ALTER TABLE "scheduling_group_session" ADD COLUMN "location" jsonb;--> statement-breakpoint
ALTER TABLE "scheduling_group_session" ADD COLUMN "meeting_url" text;--> statement-breakpoint
ALTER TABLE "scheduling_calendar_event" ADD CONSTRAINT "scheduling_calendar_event_group_session_fk" FOREIGN KEY ("group_session_id","organization_id") REFERENCES "public"."scheduling_group_session"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_calendar_event" ADD CONSTRAINT "scheduling_calendar_event_session_target_unique" UNIQUE("group_session_id","host_id","calendar_id");--> statement-breakpoint
ALTER TABLE "scheduling_calendar_event" ADD CONSTRAINT "scheduling_calendar_event_one_owner" CHECK (("scheduling_calendar_event"."booking_id" IS NULL) <> ("scheduling_calendar_event"."group_session_id" IS NULL));