CREATE TABLE "incident_locations" (
	"incident_id" integer PRIMARY KEY NOT NULL,
	"lat" numeric(7, 5) NOT NULL,
	"lon" numeric(8, 5) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "incident_locations" ADD CONSTRAINT "incident_locations_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Hand-added: incidents.latitude/longitude were reserved but never written by the app.
-- Carry over any complete pair anyway before dropping them.
INSERT INTO "incident_locations" ("incident_id", "lat", "lon")
	SELECT "id", "latitude", "longitude" FROM "incidents"
	WHERE "latitude" IS NOT NULL AND "longitude" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "incidents" DROP COLUMN "latitude";--> statement-breakpoint
ALTER TABLE "incidents" DROP COLUMN "longitude";