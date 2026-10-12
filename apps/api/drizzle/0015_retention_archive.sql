-- Retention archive (issue 21): the worker copies to object storage what changed since its last round.
CREATE TABLE "archive_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"covered_until" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "audit_events_occurred_at_idx" ON "audit_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "connector_exchanges_recorded_at_idx" ON "connector_exchanges" USING btree ("recorded_at");--> statement-breakpoint
CREATE INDEX "invoice_records_updated_at_idx" ON "invoice_records" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "invoices_updated_at_idx" ON "invoices" USING btree ("updated_at");--> statement-breakpoint
-- Invoices and their records note every change, whoever makes it: the archive exports the ones changed
-- since its last round. The time of the transaction: a round leaves the last minutes for the next one.
CREATE FUNCTION "touch_updated_at"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	NEW.updated_at := now();
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "invoices_touch_updated_at" BEFORE UPDATE ON "invoices" FOR EACH ROW EXECUTE FUNCTION "touch_updated_at"();--> statement-breakpoint
CREATE TRIGGER "invoice_records_touch_updated_at" BEFORE UPDATE ON "invoice_records" FOR EACH ROW EXECUTE FUNCTION "touch_updated_at"();
