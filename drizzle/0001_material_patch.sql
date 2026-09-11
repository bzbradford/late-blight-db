CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_id" text,
	"table_name" text NOT NULL,
	"row_id" text NOT NULL,
	"action" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "counties" (
	"fips" char(5) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"state_fips" char(2) NOT NULL,
	"state_usps" char(2) NOT NULL,
	"state_name" text NOT NULL,
	"lon" numeric(9, 5) NOT NULL,
	"lat" numeric(8, 5) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diseases" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"scientific_name" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "diseases_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" serial PRIMARY KEY NOT NULL,
	"disease_id" integer NOT NULL,
	"county_fips" char(5) NOT NULL,
	"observed_on" date NOT NULL,
	"reported_on" date,
	"crop" text,
	"operation_type" text,
	"strain" text,
	"comments" text,
	"source" text,
	"latitude" numeric(8, 5),
	"longitude" numeric(9, 5),
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_disease_id_diseases_id_fk" FOREIGN KEY ("disease_id") REFERENCES "public"."diseases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_county_fips_counties_fips_fk" FOREIGN KEY ("county_fips") REFERENCES "public"."counties"("fips") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_table_row_idx" ON "audit_log" USING btree ("table_name","row_id");--> statement-breakpoint
CREATE INDEX "counties_state_usps_idx" ON "counties" USING btree ("state_usps");--> statement-breakpoint
CREATE INDEX "counties_name_idx" ON "counties" USING btree ("name");--> statement-breakpoint
CREATE INDEX "incidents_disease_observed_idx" ON "incidents" USING btree ("disease_id","observed_on");--> statement-breakpoint
CREATE INDEX "incidents_county_disease_idx" ON "incidents" USING btree ("county_fips","disease_id");--> statement-breakpoint
CREATE INDEX "incidents_observed_on_idx" ON "incidents" USING btree ("observed_on");