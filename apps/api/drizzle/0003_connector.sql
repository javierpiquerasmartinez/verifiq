CREATE TABLE "connector_credentials" (
	"issuer_id" uuid PRIMARY KEY NOT NULL,
	"environment" text NOT NULL,
	"sealed_api_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connector_exchanges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issuer_id" uuid NOT NULL,
	"invoice_record_id" uuid,
	"operation" text NOT NULL,
	"method" text NOT NULL,
	"url" text NOT NULL,
	"request_headers" jsonb NOT NULL,
	"request_body" text,
	"response_status" integer,
	"response_headers" jsonb,
	"response_body" text,
	"error" text,
	"started_at" timestamp with time zone NOT NULL,
	"duration_ms" integer NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "connector_credentials" ADD CONSTRAINT "connector_credentials_issuer_id_issuers_id_fk" FOREIGN KEY ("issuer_id") REFERENCES "public"."issuers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_exchanges" ADD CONSTRAINT "connector_exchanges_issuer_id_issuers_id_fk" FOREIGN KEY ("issuer_id") REFERENCES "public"."issuers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "connector_exchanges_issuer_id_idx" ON "connector_exchanges" USING btree ("issuer_id","recorded_at");--> statement-breakpoint
CREATE INDEX "connector_exchanges_invoice_record_id_idx" ON "connector_exchanges" USING btree ("invoice_record_id");--> statement-breakpoint
-- Connector exchanges are evidence: rows are only ever added (reject_change comes from migration 0002).
CREATE TRIGGER "connector_exchanges_append_only" BEFORE UPDATE OR DELETE ON "connector_exchanges" FOR EACH ROW EXECUTE FUNCTION "reject_change"();
