CREATE TABLE "invitations" (
	"id" serial PRIMARY KEY NOT NULL,
	"token_hash" char(64) NOT NULL,
	"kind" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"user_id" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"revoked_at" timestamp,
	CONSTRAINT "invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "imported" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "role" text DEFAULT 'reporter' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "affiliation" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "deactivated_at" timestamp;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "last_sign_in_at" timestamp;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invitations_email_idx" ON "invitations" USING btree ("email");--> statement-breakpoint
-- Hand-written below this line.
--
-- Every account that exists before roles did was made by `pnpm create-admin`.
UPDATE "user" SET "role" = 'admin';--> statement-breakpoint
-- Better Auth owns the user table's Drizzle schema, which has no way to declare a check,
-- so the role vocabulary is enforced here. See ROLES in src/lib/auth/roles.ts.
ALTER TABLE "user" ADD CONSTRAINT "user_role_check" CHECK ("role" IN ('admin', 'reporter'));--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_kind_check" CHECK ("kind" IN ('invite', 'reset'));--> statement-breakpoint
-- Rows that came in through CSV import say so in audit_log.
UPDATE "incidents" SET "imported" = true
WHERE "id"::text IN (
	SELECT "row_id" FROM "audit_log" WHERE "table_name" = 'incidents' AND "action" = 'import'
);
