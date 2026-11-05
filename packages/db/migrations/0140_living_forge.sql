CREATE TYPE "public"."scheduling_oauth_app_provider" AS ENUM('google', 'microsoft', 'zoom');--> statement-breakpoint
CREATE TYPE "public"."scheduling_oauth_app_status" AS ENUM('active', 'failing');--> statement-breakpoint
CREATE TABLE "scheduling_oauth_app" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"environment_id" text NOT NULL,
	"provider" "scheduling_oauth_app_provider" NOT NULL,
	"client_id" text NOT NULL,
	"tenant_id" text,
	"encrypted_credentials" text NOT NULL,
	"redirect_uri" text,
	"completion_url" text,
	"secret_expires_at" timestamp with time zone,
	"status" "scheduling_oauth_app_status" DEFAULT 'active' NOT NULL,
	"last_error_code" text,
	"last_error_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduling_oauth_app_id_organization_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "scheduling_oauth_app_provider_unique" UNIQUE("environment_id","provider")
);
--> statement-breakpoint
ALTER TABLE "scheduling_calendar_connection" ADD COLUMN "oauth_app_id" text;--> statement-breakpoint
ALTER TABLE "scheduling_oauth_state" ADD COLUMN "oauth_app_id" text;--> statement-breakpoint
ALTER TABLE "scheduling_oauth_state" ADD COLUMN "redirect_uri" text;--> statement-breakpoint
ALTER TABLE "scheduling_oauth_state" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "scheduling_settings" ADD COLUMN "privacy_url" text;--> statement-breakpoint
ALTER TABLE "scheduling_oauth_app" ADD CONSTRAINT "scheduling_oauth_app_environment_fk" FOREIGN KEY ("environment_id","organization_id") REFERENCES "public"."environment"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_calendar_connection" ADD CONSTRAINT "scheduling_calendar_connection_oauth_app_fk" FOREIGN KEY ("oauth_app_id","organization_id") REFERENCES "public"."scheduling_oauth_app"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_oauth_state" ADD CONSTRAINT "scheduling_oauth_state_oauth_app_fk" FOREIGN KEY ("oauth_app_id","organization_id") REFERENCES "public"."scheduling_oauth_app"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scheduling_calendar_connection_oauth_app_idx" ON "scheduling_calendar_connection" USING btree ("oauth_app_id") WHERE "scheduling_calendar_connection"."oauth_app_id" IS NOT NULL;