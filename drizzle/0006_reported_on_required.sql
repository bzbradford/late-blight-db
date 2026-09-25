-- Hand-written above the generated line. Detections recorded before the report date was
-- required take their observation date, as a CSV row with a blank reported_on does. Each
-- one gets an audit row, so a backfilled date stays distinguishable from a recorded one.
INSERT INTO "audit_log" ("actor_id", "table_name", "row_id", "action", "before", "after")
SELECT NULL, 'incidents', "id"::text, 'backfill-reported-on',
	jsonb_build_object('reportedOn', NULL),
	jsonb_build_object('reportedOn', "observed_on")
FROM "incidents" WHERE "reported_on" IS NULL;--> statement-breakpoint
UPDATE "incidents" SET "reported_on" = "observed_on" WHERE "reported_on" IS NULL;--> statement-breakpoint
ALTER TABLE "incidents" ALTER COLUMN "reported_on" SET NOT NULL;
