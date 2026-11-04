CREATE TABLE "scheduling_holiday_calendar" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"environment_id" text NOT NULL,
	"name" text NOT NULL,
	"country_code" text,
	"encrypted_ics_url" text,
	"holidays" jsonb,
	"host_ids" jsonb,
	"host_filter" jsonb,
	"delegate_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"existing_bookings" "scheduling_out_of_office_existing" DEFAULT 'leave' NOT NULL,
	"last_read_at" timestamp with time zone,
	"last_error" text,
	"next_sync_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduling_public_holiday" (
	"country_code" text NOT NULL,
	"date" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "scheduling_public_holiday_pk" PRIMARY KEY("country_code","date")
);
--> statement-breakpoint
CREATE TABLE "scheduling_public_holiday_source" (
	"country_code" text PRIMARY KEY NOT NULL,
	"read_at" timestamp with time zone,
	"next_read_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scheduling_out_of_office" ADD COLUMN "source_key" text;--> statement-breakpoint
ALTER TABLE "scheduling_holiday_calendar" ADD CONSTRAINT "scheduling_holiday_calendar_environment_fk" FOREIGN KEY ("environment_id","organization_id") REFERENCES "public"."environment"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scheduling_holiday_calendar_environment_idx" ON "scheduling_holiday_calendar" USING btree ("environment_id","name");--> statement-breakpoint
CREATE INDEX "scheduling_holiday_calendar_due_idx" ON "scheduling_holiday_calendar" USING btree ("next_sync_at");--> statement-breakpoint
CREATE UNIQUE INDEX "scheduling_out_of_office_source_key_idx" ON "scheduling_out_of_office" USING btree ("environment_id","source_key") WHERE "scheduling_out_of_office"."source_key" IS NOT NULL;