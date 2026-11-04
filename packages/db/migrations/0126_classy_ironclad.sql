CREATE TYPE "public"."scheduling_attendee_role" AS ENUM('attendee', 'guest');--> statement-breakpoint
CREATE TYPE "public"."scheduling_calendar_details" AS ENUM('neutral', 'full');--> statement-breakpoint
ALTER TABLE "scheduling_attendee" ADD COLUMN "role" "scheduling_attendee_role" DEFAULT 'attendee' NOT NULL;--> statement-breakpoint
ALTER TABLE "scheduling_calendar_event" ADD COLUMN "details_written" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "scheduling_event_type" ADD COLUMN "max_guests" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "scheduling_event_type" ADD COLUMN "host_calendar_details" "scheduling_calendar_details" DEFAULT 'neutral' NOT NULL;