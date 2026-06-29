CREATE TYPE "public"."estimate_status" AS ENUM('draft', 'sent', 'accepted', 'declined');--> statement-breakpoint
CREATE TABLE "estimate_number_counters" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estimates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer NOT NULL,
	"status" "estimate_status" DEFAULT 'draft' NOT NULL,
	"lead_snapshot" jsonb NOT NULL,
	"input_snapshot" jsonb NOT NULL,
	"breakdown_snapshot" jsonb NOT NULL,
	"public_token" text NOT NULL,
	"organization_id" text NOT NULL,
	"lead_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "estimate_number_counters" ADD CONSTRAINT "estimate_number_counters_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "estimates_public_token_uidx" ON "estimates" USING btree ("public_token");--> statement-breakpoint
CREATE UNIQUE INDEX "estimates_org_number_uidx" ON "estimates" USING btree ("organization_id","number");--> statement-breakpoint
CREATE INDEX "estimates_org_idx" ON "estimates" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "estimates_org_lead_idx" ON "estimates" USING btree ("organization_id","lead_id");--> statement-breakpoint
CREATE INDEX "estimates_org_status_idx" ON "estimates" USING btree ("organization_id","status");