CREATE TABLE "sign_in_failures" (
	"limiter" text NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"reset_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sign_in_failures_limiter_key_pk" PRIMARY KEY("limiter","key")
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE INDEX "sign_in_failures_reset_at_idx" ON "sign_in_failures" USING btree ("reset_at");