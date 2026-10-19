ALTER TABLE "drafts" ADD COLUMN "corrected_invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "correction_reason" text;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "correction_note" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "corrected_invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_corrected_invoice_id_invoices_id_fk" FOREIGN KEY ("corrected_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_corrected_invoice_id_invoices_id_fk" FOREIGN KEY ("corrected_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoices_corrected_invoice_id_idx" ON "invoices" USING btree ("corrected_invoice_id");--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_correction_check" CHECK (("drafts"."corrected_invoice_id" IS NULL) = ("drafts"."correction_reason" IS NULL) AND ("drafts"."corrected_invoice_id" IS NULL) = ("drafts"."correction_note" IS NULL));--> statement-breakpoint
-- The invoice a corrective invoice corrects is frozen with it: only migration 0011's corrections change a copy.
CREATE OR REPLACE FUNCTION "freeze_issued_invoice"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
	latest_status text;
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'Invoice % is issued and cannot be deleted', OLD.id;
	END IF;
	IF (NEW.id, NEW.issuer_id, NEW.recipient_id, NEW.series, NEW.number, NEW.issue_date, NEW.issued_by, NEW.created_at, NEW.corrected_invoice_id)
		IS DISTINCT FROM (OLD.id, OLD.issuer_id, OLD.recipient_id, OLD.series, OLD.number, OLD.issue_date, OLD.issued_by, OLD.created_at, OLD.corrected_invoice_id)
		OR (NEW.snapshot - 'recipient' - 'operationDescription') IS DISTINCT FROM (OLD.snapshot - 'recipient' - 'operationDescription')
	THEN
		RAISE EXCEPTION 'Invoice % is issued and its copy cannot change', OLD.id;
	END IF;
	IF NEW.snapshot IS NOT DISTINCT FROM OLD.snapshot THEN
		RETURN NEW;
	END IF;
	SELECT "status" INTO latest_status FROM "invoice_records" WHERE "invoice_id" = OLD.id ORDER BY "created_at" DESC LIMIT 1;
	IF latest_status IS NULL OR latest_status NOT IN ('blocked', 'rejected', 'accepted-with-errors')
		OR (latest_status = 'accepted-with-errors' AND NEW.snapshot -> 'recipient' IS DISTINCT FROM OLD.snapshot -> 'recipient')
	THEN
		RAISE EXCEPTION 'Invoice % is issued and its copy cannot change this way while its record is %', OLD.id, latest_status;
	END IF;
	RETURN NEW;
END;
$$;
