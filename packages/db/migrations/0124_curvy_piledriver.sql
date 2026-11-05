CREATE TABLE "hipaa_session_activity" (
	"session_id" text PRIMARY KEY NOT NULL,
	"last_active_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_hipaa_mode" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"baa_signed_at" timestamp with time zone NOT NULL,
	"baa_reference" text NOT NULL,
	"enabled_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dedicated_ip_pool" ADD COLUMN "tls_required_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email" ADD COLUMN "require_tls" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "email" ADD COLUMN "hipaa_origin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "hipaa_session_activity" ADD CONSTRAINT "hipaa_session_activity_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_hipaa_mode" ADD CONSTRAINT "organization_hipaa_mode_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_hipaa_mode" ADD CONSTRAINT "organization_hipaa_mode_enabled_by_user_id_user_id_fk" FOREIGN KEY ("enabled_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;