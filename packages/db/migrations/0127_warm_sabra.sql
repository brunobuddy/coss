CREATE TYPE "public"."scheduling_delegation_provider" AS ENUM('google', 'microsoft');--> statement-breakpoint
CREATE TYPE "public"."scheduling_delegation_status" AS ENUM('pending', 'active', 'failing', 'deleting');--> statement-breakpoint
ALTER TYPE "public"."scheduling_connection_status" ADD VALUE 'delegation_failing';--> statement-breakpoint
CREATE TABLE "scheduling_calendar_delegation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"environment_id" text NOT NULL,
	"provider" "scheduling_delegation_provider" NOT NULL,
	"domain" text NOT NULL,
	"match_host_email" boolean DEFAULT true NOT NULL,
	"status" "scheduling_delegation_status" DEFAULT 'pending' NOT NULL,
	"encrypted_credentials" text NOT NULL,
	"client_id" text NOT NULL,
	"tenant_id" text,
	"verify_account" text,
	"last_error_code" text,
	"failing_since" timestamp with time zone,
	"secret_expires_at" timestamp with time zone,
	"next_reconcile_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reconcile_cursor" text,
	"lease_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduling_calendar_delegation_id_organization_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "scheduling_calendar_delegation_domain_unique" UNIQUE("environment_id","domain")
);
--> statement-breakpoint
ALTER TABLE "scheduling_calendar_connection" ADD COLUMN "delegation_id" text;--> statement-breakpoint
ALTER TABLE "scheduling_host" ADD COLUMN "calendar_account" text;--> statement-breakpoint
ALTER TABLE "scheduling_calendar_delegation" ADD CONSTRAINT "scheduling_calendar_delegation_environment_fk" FOREIGN KEY ("environment_id","organization_id") REFERENCES "public"."environment"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scheduling_calendar_delegation_due_idx" ON "scheduling_calendar_delegation" USING btree ("next_reconcile_at");--> statement-breakpoint
ALTER TABLE "scheduling_calendar_connection" ADD CONSTRAINT "scheduling_calendar_connection_delegation_fk" FOREIGN KEY ("delegation_id","organization_id") REFERENCES "public"."scheduling_calendar_delegation"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scheduling_calendar_connection_delegation_idx" ON "scheduling_calendar_connection" USING btree ("delegation_id") WHERE "scheduling_calendar_connection"."delegation_id" IS NOT NULL;