import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { canEditIncident, type Viewer } from '$lib/auth/roles';
import { counties, diseases, incidents, user } from '$lib/server/db/schema';

/** Who entered a detection, as shown publicly. Never the email address or user ID. */
export type ReportedBy = { name: string; affiliation: string | null };

export type Detection = {
	id: number;
	/** The ID shown to the public and used in CSV files. `id` is internal. */
	publicId: string;
	countyFips: string;
	countyName: string;
	stateUsps: string;
	observedOn: string;
	reportedOn: string;
	crop: string | null;
	operationType: string | null;
	strain: string | null;
	comments: string | null;
	source: string | null;
	/** Null for rows with no creator (seed data). */
	reportedBy: ReportedBy | null;
	/** Came in by CSV import, so `reportedBy` is who imported it — "Imported by". */
	imported: boolean;
	/** The viewer may edit it. Computed per request; false for the public. */
	canEdit: boolean;
};

export type CountyAggregateRow = {
	fips: string;
	name: string;
	stateUsps: string;
	lon: number;
	lat: number;
	firstDetection: string;
	lastDetection: string;
	count: number;
};

/** Soft-deleted rows are retractions — they must never reach the public map. */
function visible(diseaseSlug: string, year: number) {
	return and(
		eq(diseases.slug, diseaseSlug),
		isNull(incidents.deletedAt),
		sql`extract(year from ${incidents.observedOn}) = ${year}`
	);
}

export async function getDetections(
	diseaseSlug: string,
	year: number,
	viewer: Viewer | null = null
): Promise<Detection[]> {
	const rows = await db
		.select({
			id: incidents.id,
			publicId: incidents.publicId,
			countyFips: incidents.countyFips,
			countyName: counties.name,
			stateUsps: counties.stateUsps,
			observedOn: incidents.observedOn,
			reportedOn: incidents.reportedOn,
			crop: incidents.crop,
			operationType: incidents.operationType,
			strain: incidents.strain,
			comments: incidents.comments,
			source: incidents.source,
			imported: incidents.imported,
			createdBy: incidents.createdBy,
			reporterName: user.name,
			reporterAffiliation: user.affiliation
		})
		.from(incidents)
		.innerJoin(diseases, eq(diseases.id, incidents.diseaseId))
		.innerJoin(counties, eq(counties.fips, incidents.countyFips))
		.leftJoin(user, eq(user.id, incidents.createdBy))
		.where(visible(diseaseSlug, year))
		.orderBy(desc(incidents.observedOn), desc(incidents.id));

	// The creator's user ID is used here and dropped: it never leaves the server.
	return rows.map(({ createdBy, reporterName, reporterAffiliation, ...r }) => ({
		...r,
		reportedBy:
			reporterName === null ? null : { name: reporterName, affiliation: reporterAffiliation },
		canEdit: canEditIncident(viewer, createdBy)
	}));
}

/**
 * Per-county rollup driving the choropleth.
 *
 * `first`/`last` are both returned because the symbology needs different ones
 * depending on the year: the current-season recency ramp reads `last`, the
 * past-season timing ramp reads `first`. See `$lib/map/symbology`.
 *
 * `lon`/`lat` are the county interior points, used to auto-expand the map extent
 * when detections fall outside the configured default view.
 */
export async function getCountyAggregates(
	diseaseSlug: string,
	year: number
): Promise<CountyAggregateRow[]> {
	return db
		.select({
			fips: incidents.countyFips,
			name: counties.name,
			stateUsps: counties.stateUsps,
			lon: counties.lon,
			lat: counties.lat,
			firstDetection: sql<string>`min(${incidents.observedOn})::text`,
			lastDetection: sql<string>`max(${incidents.observedOn})::text`,
			count: sql<number>`count(*)::int`
		})
		.from(incidents)
		.innerJoin(diseases, eq(diseases.id, incidents.diseaseId))
		.innerJoin(counties, eq(counties.fips, incidents.countyFips))
		.where(visible(diseaseSlug, year))
		.groupBy(incidents.countyFips, counties.name, counties.stateUsps, counties.lon, counties.lat);
}

export type ExportRow = {
	publicId: string;
	diseaseSlug: string;
	countyFips: string;
	stateUsps: string;
	countyName: string;
	observedOn: string;
	reportedOn: string;
	crop: string | null;
	operationType: string | null;
	strain: string | null;
	source: string | null;
	comments: string | null;
	reportedBy: ReportedBy | null;
	imported: boolean;
};

/**
 * Rows for the public CSV download: one disease, one year or all of them. Retracted
 * detections are excluded, exactly as on the map.
 */
export async function getDetectionsForExport(
	diseaseSlug: string,
	year: number | null
): Promise<ExportRow[]> {
	const rows = await db
		.select({
			publicId: incidents.publicId,
			diseaseSlug: diseases.slug,
			countyFips: incidents.countyFips,
			stateUsps: counties.stateUsps,
			countyName: counties.name,
			observedOn: incidents.observedOn,
			reportedOn: incidents.reportedOn,
			crop: incidents.crop,
			operationType: incidents.operationType,
			strain: incidents.strain,
			source: incidents.source,
			comments: incidents.comments,
			imported: incidents.imported,
			reporterName: user.name,
			reporterAffiliation: user.affiliation
		})
		.from(incidents)
		.innerJoin(diseases, eq(diseases.id, incidents.diseaseId))
		.innerJoin(counties, eq(counties.fips, incidents.countyFips))
		.leftJoin(user, eq(user.id, incidents.createdBy))
		.where(
			and(
				eq(diseases.slug, diseaseSlug),
				isNull(incidents.deletedAt),
				year === null ? undefined : sql`extract(year from ${incidents.observedOn}) = ${year}`
			)
		)
		.orderBy(desc(incidents.observedOn), desc(incidents.id));

	return rows.map(({ reporterName, reporterAffiliation, ...r }) => ({
		...r,
		reportedBy:
			reporterName === null ? null : { name: reporterName, affiliation: reporterAffiliation }
	}));
}
