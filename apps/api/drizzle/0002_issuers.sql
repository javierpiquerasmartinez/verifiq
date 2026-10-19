CREATE TABLE "issuer_memberships" (
	"issuer_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issuer_memberships_issuer_id_user_id_pk" PRIMARY KEY("issuer_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "issuers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"tax_id" text NOT NULL,
	"address" text NOT NULL,
	"postal_code" text NOT NULL,
	"municipality" text NOT NULL,
	"province" text NOT NULL,
	"email" text,
	"phone" text,
	"iban" text,
	"logo_key" text,
	"default_withholding" smallint,
	"default_vat_rate" smallint,
	"default_exemption_ground" text,
	"series_prefix" text,
	"corrective_prefix" text,
	"series_confirmed_at" timestamp with time zone,
	"onboarding_completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issuers_tax_id_unique" UNIQUE("tax_id"),
	CONSTRAINT "issuers_default_vat_check" CHECK ("issuers"."default_vat_rate" IS NULL OR "issuers"."default_exemption_ground" IS NULL),
	CONSTRAINT "issuers_series_check" CHECK (("issuers"."series_prefix" IS NULL) = ("issuers"."series_confirmed_at" IS NULL) AND ("issuers"."corrective_prefix" IS NULL) = ("issuers"."series_confirmed_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "legal_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issuer_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"document" text NOT NULL,
	"version" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "issuer_memberships" ADD CONSTRAINT "issuer_memberships_issuer_id_issuers_id_fk" FOREIGN KEY ("issuer_id") REFERENCES "public"."issuers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issuer_memberships" ADD CONSTRAINT "issuer_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_issuer_id_issuers_id_fk" FOREIGN KEY ("issuer_id") REFERENCES "public"."issuers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issuer_memberships_user_id_idx" ON "issuer_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "legal_acceptances_issuer_id_idx" ON "legal_acceptances" USING btree ("issuer_id");--> statement-breakpoint
-- ADR 0004: the series prefixes are chosen once. After confirming them they never change.
CREATE FUNCTION "freeze_confirmed_series"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF OLD.series_confirmed_at IS NOT NULL AND (
		NEW.series_prefix IS DISTINCT FROM OLD.series_prefix
		OR NEW.corrective_prefix IS DISTINCT FROM OLD.corrective_prefix
		OR NEW.series_confirmed_at IS DISTINCT FROM OLD.series_confirmed_at
	) THEN
		RAISE EXCEPTION 'The series of issuer % are confirmed and cannot change', OLD.id;
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "issuers_freeze_confirmed_series" BEFORE UPDATE ON "issuers" FOR EACH ROW EXECUTE FUNCTION "freeze_confirmed_series"();--> statement-breakpoint
-- Legal acceptances are evidence: rows are only ever added.
CREATE FUNCTION "reject_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "legal_acceptances_append_only" BEFORE UPDATE OR DELETE ON "legal_acceptances" FOR EACH ROW EXECUTE FUNCTION "reject_change"();
