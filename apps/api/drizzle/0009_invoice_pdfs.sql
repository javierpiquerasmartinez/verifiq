CREATE TABLE "invoice_pdfs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issuer_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_pdfs_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "invoice_pdfs_version_unique" UNIQUE("invoice_id","version")
);
--> statement-breakpoint
ALTER TABLE "invoice_pdfs" ADD CONSTRAINT "invoice_pdfs_issuer_id_issuers_id_fk" FOREIGN KEY ("issuer_id") REFERENCES "public"."issuers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_pdfs" ADD CONSTRAINT "invoice_pdfs_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_pdfs_issuer_id_idx" ON "invoice_pdfs" USING btree ("issuer_id");--> statement-breakpoint
-- A PDF that left Verifiq never changes: new versions are new rows (reject_change comes from migration 0002).
CREATE TRIGGER "invoice_pdfs_append_only" BEFORE UPDATE OR DELETE ON "invoice_pdfs" FOR EACH ROW EXECUTE FUNCTION "reject_change"();
