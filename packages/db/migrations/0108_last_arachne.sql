CREATE TYPE "public"."organization_logo_status" AS ENUM('found', 'not_found', 'hidden');--> statement-breakpoint
CREATE TABLE "organization_logo" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"status" "organization_logo_status" NOT NULL,
	"domain" text,
	"source_url" text,
	"content_type" text,
	"image" "bytea",
	"sha256" text,
	"width" integer,
	"height" integer,
	"failures" integer DEFAULT 0 NOT NULL,
	"checked_at" timestamp with time zone,
	"next_check_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_logo" ADD CONSTRAINT "organization_logo_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;