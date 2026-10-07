ALTER TABLE "invoice_pdfs" ADD COLUMN "invoice_record_id" uuid;--> statement-breakpoint
ALTER TABLE "invoice_records" ADD COLUMN "operation" text DEFAULT 'submission' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_records" ADD COLUMN "previous_rejection" text;--> statement-breakpoint
ALTER TABLE "invoice_pdfs" ADD CONSTRAINT "invoice_pdfs_invoice_record_id_invoice_records_id_fk" FOREIGN KEY ("invoice_record_id") REFERENCES "public"."invoice_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Until now every invoice had one record: its PDFs carry that record's QR. PDFs are append-only
-- (migration 0009), so the trigger steps aside for this one backfill.
ALTER TABLE "invoice_pdfs" DISABLE TRIGGER "invoice_pdfs_append_only";--> statement-breakpoint
UPDATE "invoice_pdfs" SET "invoice_record_id" = (
	SELECT "id" FROM "invoice_records" WHERE "invoice_records"."invoice_id" = "invoice_pdfs"."invoice_id" ORDER BY "created_at" LIMIT 1
) WHERE "invoice_record_id" IS NULL;--> statement-breakpoint
ALTER TABLE "invoice_pdfs" ENABLE TRIGGER "invoice_pdfs_append_only";--> statement-breakpoint
-- Issued invoices stay frozen, but for the one correction the spec allows: while the invoice's latest
-- record is blocked, rejected or accepted with errors, the user corrects the recipient's data and the
-- description of its copy before sending it again. The rest of the copy never changes.
CREATE OR REPLACE FUNCTION "freeze_issued_invoice"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'Invoice % is issued and cannot be deleted', OLD.id;
	END IF;
	IF (NEW.id, NEW.issuer_id, NEW.recipient_id, NEW.series, NEW.number, NEW.issue_date, NEW.issued_by, NEW.created_at)
		IS DISTINCT FROM (OLD.id, OLD.issuer_id, OLD.recipient_id, OLD.series, OLD.number, OLD.issue_date, OLD.issued_by, OLD.created_at)
	THEN
		RAISE EXCEPTION 'Invoice % is issued and its copy cannot change', OLD.id;
	END IF;
	IF (NEW.snapshot - 'recipient' - 'operationDescription') IS DISTINCT FROM (OLD.snapshot - 'recipient' - 'operationDescription') THEN
		RAISE EXCEPTION 'Invoice % is issued and its copy cannot change', OLD.id;
	END IF;
	IF NEW.snapshot IS DISTINCT FROM OLD.snapshot AND NOT EXISTS (
		SELECT 1 FROM (
			SELECT "status" FROM "invoice_records" WHERE "invoice_id" = OLD.id ORDER BY "created_at" DESC LIMIT 1
		) AS "latest"
		WHERE "latest"."status" IN ('blocked', 'rejected', 'accepted-with-errors')
	) THEN
		RAISE EXCEPTION 'Invoice % is issued and its copy cannot change while its record has no incident', OLD.id;
	END IF;
	RETURN NEW;
END;
$$;
