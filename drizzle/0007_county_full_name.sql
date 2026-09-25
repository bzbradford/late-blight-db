-- Hand-written around the generated line, which would fail on a table that already has
-- rows. The bare name stands in until `pnpm seed` (run by every deploy, right after
-- migrating) loads the Census full names from scripts/data/counties.csv.
ALTER TABLE "counties" ADD COLUMN "full_name" text;--> statement-breakpoint
UPDATE "counties" SET "full_name" = "name";--> statement-breakpoint
ALTER TABLE "counties" ALTER COLUMN "full_name" SET NOT NULL;
