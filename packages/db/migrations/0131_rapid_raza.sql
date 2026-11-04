CREATE TABLE "scheduling_out_of_office_delegate" (
	"out_of_office_id" text NOT NULL,
	"host_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "scheduling_out_of_office_delegate_pk" PRIMARY KEY("out_of_office_id","host_id")
);
--> statement-breakpoint
ALTER TABLE "scheduling_out_of_office_delegate" ADD CONSTRAINT "scheduling_out_of_office_delegate_entry_fk" FOREIGN KEY ("out_of_office_id","organization_id") REFERENCES "public"."scheduling_out_of_office"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_out_of_office_delegate" ADD CONSTRAINT "scheduling_out_of_office_delegate_host_fk" FOREIGN KEY ("host_id","organization_id") REFERENCES "public"."scheduling_host"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scheduling_out_of_office_delegate_host_idx" ON "scheduling_out_of_office_delegate" USING btree ("host_id");