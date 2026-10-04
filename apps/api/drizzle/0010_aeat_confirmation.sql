CREATE TABLE "webhook_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"body" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoice_records" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoice_records" ADD COLUMN "aeat_error_code" text;--> statement-breakpoint
ALTER TABLE "invoice_records" ADD COLUMN "aeat_error_message" text;--> statement-breakpoint
ALTER TABLE "invoice_records" ADD COLUMN "registration_code" text;--> statement-breakpoint
ALTER TABLE "invoice_records" ADD COLUMN "unconfirmed_alerted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "invoice_records_status_idx" ON "invoice_records" USING btree ("status","created_at");--> statement-breakpoint
-- What the connector said is evidence (reject_change comes from migration 0002).
CREATE TRIGGER "webhook_deliveries_append_only" BEFORE UPDATE OR DELETE ON "webhook_deliveries" FOR EACH ROW EXECUTE FUNCTION "reject_change"();--> statement-breakpoint
-- The AEAT's registration code joins what the connector answered: once set, it never changes.
CREATE OR REPLACE FUNCTION "freeze_record_evidence"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
		OR (OLD.connector_record_id IS NOT NULL AND NEW.connector_record_id IS DISTINCT FROM OLD.connector_record_id)
		OR (OLD.fingerprint IS NOT NULL AND NEW.fingerprint IS DISTINCT FROM OLD.fingerprint)
		OR (OLD.verification_url IS NOT NULL AND NEW.verification_url IS DISTINCT FROM OLD.verification_url)
		OR (OLD.qr_png IS NOT NULL AND NEW.qr_png IS DISTINCT FROM OLD.qr_png)
		OR (OLD.registration_code IS NOT NULL AND NEW.registration_code IS DISTINCT FROM OLD.registration_code)
	THEN
		RAISE EXCEPTION 'What the connector answered for record % cannot change', OLD.id;
	END IF;
	RETURN NEW;
END;
$$;
