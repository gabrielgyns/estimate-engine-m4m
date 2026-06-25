ALTER TABLE "leads" DROP CONSTRAINT "leads_phone_unique";--> statement-breakpoint
ALTER TABLE "leads" DROP CONSTRAINT "leads_zip_code_unique";--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "organization_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "leads_org_phone_uidx" ON "leads" USING btree ("organization_id","phone");