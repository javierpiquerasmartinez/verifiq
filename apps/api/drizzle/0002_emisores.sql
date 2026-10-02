CREATE TABLE "emisor_memberships" (
	"emisor_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "emisor_memberships_emisor_id_user_id_pk" PRIMARY KEY("emisor_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "emisores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"nif" text NOT NULL,
	"address" text NOT NULL,
	"postal_code" text NOT NULL,
	"municipality" text NOT NULL,
	"province" text NOT NULL,
	"email" text,
	"phone" text,
	"iban" text,
	"logo_key" text,
	"default_retencion_irpf" smallint,
	"default_iva_rate" smallint,
	"default_supuesto_exencion" text,
	"serie_prefix" text,
	"rectificativa_prefix" text,
	"serie_confirmed_at" timestamp with time zone,
	"onboarding_completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "emisores_nif_unique" UNIQUE("nif"),
	CONSTRAINT "emisores_default_iva_check" CHECK ("emisores"."default_iva_rate" IS NULL OR "emisores"."default_supuesto_exencion" IS NULL),
	CONSTRAINT "emisores_serie_check" CHECK (("emisores"."serie_prefix" IS NULL) = ("emisores"."serie_confirmed_at" IS NULL) AND ("emisores"."rectificativa_prefix" IS NULL) = ("emisores"."serie_confirmed_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "legal_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"emisor_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"document" text NOT NULL,
	"version" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "emisor_memberships" ADD CONSTRAINT "emisor_memberships_emisor_id_emisores_id_fk" FOREIGN KEY ("emisor_id") REFERENCES "public"."emisores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emisor_memberships" ADD CONSTRAINT "emisor_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_emisor_id_emisores_id_fk" FOREIGN KEY ("emisor_id") REFERENCES "public"."emisores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "emisor_memberships_user_id_idx" ON "emisor_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "legal_acceptances_emisor_id_idx" ON "legal_acceptances" USING btree ("emisor_id");--> statement-breakpoint
-- ADR 0004: the Serie prefixes are chosen once. After confirming them they never change.
CREATE FUNCTION "freeze_confirmed_serie"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF OLD.serie_confirmed_at IS NOT NULL AND (
		NEW.serie_prefix IS DISTINCT FROM OLD.serie_prefix
		OR NEW.rectificativa_prefix IS DISTINCT FROM OLD.rectificativa_prefix
		OR NEW.serie_confirmed_at IS DISTINCT FROM OLD.serie_confirmed_at
	) THEN
		RAISE EXCEPTION 'The Serie of Emisor % is confirmed and cannot change', OLD.id;
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "emisores_freeze_confirmed_serie" BEFORE UPDATE ON "emisores" FOR EACH ROW EXECUTE FUNCTION "freeze_confirmed_serie"();--> statement-breakpoint
-- Legal acceptances are evidence: rows are only ever added.
CREATE FUNCTION "reject_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "legal_acceptances_append_only" BEFORE UPDATE OR DELETE ON "legal_acceptances" FOR EACH ROW EXECUTE FUNCTION "reject_change"();
