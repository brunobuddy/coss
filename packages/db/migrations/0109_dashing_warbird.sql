CREATE TABLE "email_sender_domain_block" (
	"domain" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"group_id" text,
	"subject_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "email_sender_domain_block_organization_idx" ON "email_sender_domain_block" USING btree ("organization_id");