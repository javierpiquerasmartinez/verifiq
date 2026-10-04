CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issuer_id" uuid NOT NULL,
	"actor_user_id" text,
	"action" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"details" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issuer_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"status" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"connector_record_id" text,
	"fingerprint" text,
	"verification_url" text,
	"qr_png" text,
	"submitted_at" timestamp with time zone,
	"rejection_code" text,
	"rejection_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_records_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "series_counters" (
	"issuer_id" uuid NOT NULL,
	"series" text NOT NULL,
	"last_number" integer NOT NULL,
	CONSTRAINT "series_counters_issuer_id_series_pk" PRIMARY KEY("issuer_id","series")
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "series" text NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "number" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "issue_date" date NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "status" text NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "snapshot" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "issued_by" text NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_issuer_id_issuers_id_fk" FOREIGN KEY ("issuer_id") REFERENCES "public"."issuers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_records" ADD CONSTRAINT "invoice_records_issuer_id_issuers_id_fk" FOREIGN KEY ("issuer_id") REFERENCES "public"."issuers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_records" ADD CONSTRAINT "invoice_records_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_counters" ADD CONSTRAINT "series_counters_issuer_id_issuers_id_fk" FOREIGN KEY ("issuer_id") REFERENCES "public"."issuers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_issuer_id_idx" ON "audit_events" USING btree ("issuer_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_subject_id_idx" ON "audit_events" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "invoice_records_issuer_id_idx" ON "invoice_records" USING btree ("issuer_id");--> statement-breakpoint
CREATE INDEX "invoice_records_invoice_id_idx" ON "invoice_records" USING btree ("invoice_id");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_number_unique" UNIQUE("issuer_id","series","number");--> statement-breakpoint
-- Issued invoices are frozen: never deleted, and only their status moves on (with the corrections of the spec).
CREATE FUNCTION "freeze_issued_invoice"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'Invoice % is issued and cannot be deleted', OLD.id;
	END IF;
	IF (NEW.id, NEW.issuer_id, NEW.recipient_id, NEW.series, NEW.number, NEW.issue_date, NEW.snapshot, NEW.issued_by, NEW.created_at)
		IS DISTINCT FROM (OLD.id, OLD.issuer_id, OLD.recipient_id, OLD.series, OLD.number, OLD.issue_date, OLD.snapshot, OLD.issued_by, OLD.created_at)
	THEN
		RAISE EXCEPTION 'Invoice % is issued and its copy cannot change', OLD.id;
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "invoices_freeze_issued" BEFORE UPDATE OR DELETE ON "invoices" FOR EACH ROW EXECUTE FUNCTION "freeze_issued_invoice"();--> statement-breakpoint
-- InvoiceRecords are evidence of what was sent to the AEAT: their status moves on, rows are never deleted
-- (reject_change comes from migration 0002).
CREATE TRIGGER "invoice_records_no_delete" BEFORE DELETE ON "invoice_records" FOR EACH ROW EXECUTE FUNCTION "reject_change"();--> statement-breakpoint
CREATE TRIGGER "audit_events_append_only" BEFORE UPDATE OR DELETE ON "audit_events" FOR EACH ROW EXECUTE FUNCTION "reject_change"();
--> statement-breakpoint
-- What the connector answered is evidence: once set, the key, fingerprint, QR and URL never change.
CREATE FUNCTION "freeze_record_evidence"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
		OR (OLD.connector_record_id IS NOT NULL AND NEW.connector_record_id IS DISTINCT FROM OLD.connector_record_id)
		OR (OLD.fingerprint IS NOT NULL AND NEW.fingerprint IS DISTINCT FROM OLD.fingerprint)
		OR (OLD.verification_url IS NOT NULL AND NEW.verification_url IS DISTINCT FROM OLD.verification_url)
		OR (OLD.qr_png IS NOT NULL AND NEW.qr_png IS DISTINCT FROM OLD.qr_png)
	THEN
		RAISE EXCEPTION 'What the connector answered for record % cannot change', OLD.id;
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "invoice_records_freeze_evidence" BEFORE UPDATE ON "invoice_records" FOR EACH ROW EXECUTE FUNCTION "freeze_record_evidence"();
