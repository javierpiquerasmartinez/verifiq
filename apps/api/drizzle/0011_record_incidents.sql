ALTER TABLE "invoice_pdfs" ADD COLUMN "invoice_record_id" uuid;--> statement-breakpoint
ALTER TABLE "invoice_records" ADD COLUMN "operation" text DEFAULT 'submission' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_records" ADD COLUMN "previous_rejection" text;--> statement-breakpoint
ALTER TABLE "invoice_records" ADD COLUMN "snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "invoice_pdfs" ADD CONSTRAINT "invoice_pdfs_invoice_record_id_invoice_records_id_fk" FOREIGN KEY ("invoice_record_id") REFERENCES "public"."invoice_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Until now every invoice had one record: its PDFs carry that record's QR. PDFs are append-only
-- (migration 0009), so the trigger steps aside for this one backfill.
ALTER TABLE "invoice_pdfs" DISABLE TRIGGER "invoice_pdfs_append_only";--> statement-breakpoint
UPDATE "invoice_pdfs" SET "invoice_record_id" = (
	SELECT "id" FROM "invoice_records" WHERE "invoice_records"."invoice_id" = "invoice_pdfs"."invoice_id" ORDER BY "created_at" LIMIT 1
) WHERE "invoice_record_id" IS NULL;--> statement-breakpoint
ALTER TABLE "invoice_pdfs" ENABLE TRIGGER "invoice_pdfs_append_only";--> statement-breakpoint
-- Issued invoices stay frozen, but for the corrections the spec allows while the invoice's latest record
-- has an incident: blocked or rejected, the user corrects the recipient's data and the description of its
-- copy; accepted with errors (the invoice exists at the AEAT), only the description. The rest never changes.
CREATE OR REPLACE FUNCTION "freeze_issued_invoice"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
	latest_status text;
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'Invoice % is issued and cannot be deleted', OLD.id;
	END IF;
	IF (NEW.id, NEW.issuer_id, NEW.recipient_id, NEW.series, NEW.number, NEW.issue_date, NEW.issued_by, NEW.created_at)
		IS DISTINCT FROM (OLD.id, OLD.issuer_id, OLD.recipient_id, OLD.series, OLD.number, OLD.issue_date, OLD.issued_by, OLD.created_at)
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
$$;--> statement-breakpoint
-- Each record keeps the copy it sent. Until now every invoice had one record, which sent its current copy.
UPDATE "invoice_records" SET "snapshot" = "invoices"."snapshot" FROM "invoices"
	WHERE "invoices"."id" = "invoice_records"."invoice_id" AND "invoice_records"."snapshot" IS NULL;--> statement-breakpoint
-- What was sent is evidence, like what the connector answered: once set, the copy never changes.
CREATE OR REPLACE FUNCTION "freeze_record_evidence"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
		OR (OLD.connector_record_id IS NOT NULL AND NEW.connector_record_id IS DISTINCT FROM OLD.connector_record_id)
		OR (OLD.fingerprint IS NOT NULL AND NEW.fingerprint IS DISTINCT FROM OLD.fingerprint)
		OR (OLD.verification_url IS NOT NULL AND NEW.verification_url IS DISTINCT FROM OLD.verification_url)
		OR (OLD.qr_png IS NOT NULL AND NEW.qr_png IS DISTINCT FROM OLD.qr_png)
		OR (OLD.registration_code IS NOT NULL AND NEW.registration_code IS DISTINCT FROM OLD.registration_code)
		OR (OLD.snapshot IS NOT NULL AND NEW.snapshot IS DISTINCT FROM OLD.snapshot)
	THEN
		RAISE EXCEPTION 'What record % sent and what the connector answered cannot change', OLD.id;
	END IF;
	RETURN NEW;
END;
$$;
