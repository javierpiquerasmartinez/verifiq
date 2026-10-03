ALTER TABLE "issuers" ADD COLUMN "connector_registered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "issuers" ADD COLUMN "connector_rejection" text;--> statement-breakpoint
ALTER TABLE "issuers" ADD COLUMN "representation_state" text;--> statement-breakpoint
ALTER TABLE "issuers" ADD COLUMN "representation_signing_url" text;--> statement-breakpoint
ALTER TABLE "issuers" ADD COLUMN "representation_signer_email" text;--> statement-breakpoint
ALTER TABLE "issuers" ADD COLUMN "representation_checked_at" timestamp with time zone;