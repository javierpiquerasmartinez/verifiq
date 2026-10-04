CREATE TABLE "drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issuer_id" uuid NOT NULL,
	"recipient_id" uuid,
	"billing_period_start" date,
	"billing_period_end" date,
	"operation_description" text NOT NULL,
	"withholding" smallint NOT NULL,
	"lines" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drafts_billing_period_check" CHECK (("drafts"."billing_period_start" IS NULL) = ("drafts"."billing_period_end" IS NULL) AND "drafts"."billing_period_start" <= "drafts"."billing_period_end")
);
--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_issuer_id_issuers_id_fk" FOREIGN KEY ("issuer_id") REFERENCES "public"."issuers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_recipient_id_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."recipients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drafts_issuer_id_idx" ON "drafts" USING btree ("issuer_id","updated_at");--> statement-breakpoint
CREATE INDEX "drafts_recipient_id_idx" ON "drafts" USING btree ("recipient_id");