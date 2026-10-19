-- Operator panel (issue 19): the operator role, apart from users, and invitations it can revoke.
ALTER TABLE "invitations" ADD COLUMN "role" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_role_check" CHECK ("invitations"."role" IN ('user', 'operator'));--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_revoked_check" CHECK ("invitations"."revoked_at" IS NULL OR "invitations"."accepted_at" IS NULL);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ("users"."role" IN ('user', 'operator'));