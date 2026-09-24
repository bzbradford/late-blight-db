ALTER TABLE "user" ADD COLUMN "admin_since" timestamp;--> statement-breakpoint
-- Hand-written below this line. Existing admins rank by when their account was made.
UPDATE "user" SET "admin_since" = "created_at" WHERE "role" = 'admin';--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_admin_since_check" CHECK (("role" = 'admin') = ("admin_since" IS NOT NULL));
