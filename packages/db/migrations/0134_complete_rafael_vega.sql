ALTER TYPE "public"."billing_grant_source" ADD VALUE 'threshold';--> statement-breakpoint
ALTER TYPE "public"."billing_hold_reason" ADD VALUE 'credit_limit' BEFORE 'admin';--> statement-breakpoint
ALTER TYPE "public"."billing_invoice_kind" ADD VALUE 'threshold';--> statement-breakpoint
ALTER TABLE "billing_account" ADD COLUMN "credit_limit_cents" bigint;