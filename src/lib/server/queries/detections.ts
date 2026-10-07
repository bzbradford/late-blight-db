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
	/** The bare name, "Dane": short labels such as "Dane, WI". */
	countyName: string;
	/** "Dane County", "Richmond city": wherever the county is named in full. */
	countyFullName: string;
	stateUsps: string;
	stateName: string;
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

/**
 * The columns every public detection listing reads, with their joins. `createdBy` is
 * selected only to compute `canEdit`; `toDetection` drops it.
 */
function selectDetections() {
	return db
		.select({
			id: incidents.id,
			publicId: incidents.publicId,
			diseaseSlug: diseases.slug,
			diseaseName: diseases.name,
			countyFips: incidents.countyFips,
			countyName: counties.name,
			countyFullName: counties.fullName,
			stateUsps: counties.stateUsps,
			stateName: counties.stateName,
			observedOn: incidents.observedOn,
			reportedOn: incidents.reportedOn,
			crop: incidents.crop,
			operationType: incidents.operationType,
			strain: incidents.strain,
			comments: incidents.comments,
			source: incidents.source,
			imported: incidents.imported,
			deletedAt: incidents.deletedAt,
			createdBy: incidents.createdBy,
			reporterName: user.name,
			reporterAffiliation: user.affiliation
		})
		.from(incidents)
		.innerJoin(diseases, eq(diseases.id, incidents.diseaseId))
		.innerJoin(counties, eq(counties.fips, incidents.countyFips))
		.leftJoin(user, eq(user.id, incidents.createdBy));
}

type SelectedRow = Awaited<ReturnType<typeof selectDetections>>[number];

/** The creator's user ID is used here and dropped: it never leaves the server. */
function toDetection(row: SelectedRow, viewer: Viewer | null): Detection {
	return {
		id: row.id,
		publicId: row.publicId,
		countyFips: row.countyFips,
		countyName: row.countyName,
		countyFullName: row.countyFullName,
		stateUsps: row.stateUsps,
		stateName: row.stateName,
		observedOn: row.observedOn,
		reportedOn: row.reportedOn,
		crop: row.crop,
		operationType: row.operationType,
		strain: row.strain,
		comments: row.comments,
		source: row.source,
		reportedBy:
			row.reporterName === null
				? null
				: { name: row.reporterName, affiliation: row.reporterAffiliation },
		imported: row.imported,
		canEdit: canEditIncident(viewer, row.createdBy)
	};
}

export async function getDetections(
	diseaseSlug: string,
	year: number,
	viewer: Viewer | null = null
): Promise<Detection[]> {
	const rows = await selectDetections()
		.where(visible(diseaseSlug, year))
		.orderBy(desc(incidents.observedOn), desc(incidents.id));
	return rows.map((r) => toDetection(r, viewer));
}

/** A row of the detections table: a detection that also says which disease it is. */
export type DetectionRow = Detection & {
	diseaseSlug: string;
	diseaseName: string;
	/** Always false for the public, who never receive retracted rows. */
	retracted: boolean;
};

export type DetectionFilters = {
	diseaseSlug?: string;
	year?: number;
	/** A two-letter USPS code, "WI". */
	stateUsps?: string;
	/** Signed-in viewers only; ignored for the public. */
	includeRetracted?: boolean;
	/** A user ID. Signed-in viewers only; ignored for the public. */
	reportedBy?: string;
};

/**
 * The detections table at /detections, for anyone. The signed-in-only filters are
 * dropped here rather than by the caller, so no route can hand retracted rows to the
 * public by forgetting a check.
 */
export async function listDetectionRows(
	filters: DetectionFilters,
	viewer: Viewer | null
): Promise<DetectionRow[]> {
	const signedIn = viewer !== null;
	const rows = await selectDetections()
		.where(
			and(
				filters.diseaseSlug ? eq(diseases.slug, filters.diseaseSlug) : undefined,
				filters.year
					? sql`extract(year from ${incidents.observedOn}) = ${filters.year}`
					: undefined,
				filters.stateUsps ? eq(counties.stateUsps, filters.stateUsps) : undefined,
				signedIn && filters.includeRetracted ? undefined : isNull(incidents.deletedAt),
				signedIn && filters.reportedBy ? eq(incidents.createdBy, filters.reportedBy) : undefined
			)
		)
		.orderBy(desc(incidents.observedOn), desc(incidents.id));

	return rows.map((r) => ({
		...toDetection(r, viewer),
		diseaseSlug: r.diseaseSlug,
		diseaseName: r.diseaseName,
		retracted: r.deletedAt !== null
	}));
}

/**
 * Every year with a detection of any disease, newest first, for the table's year filter.
 * Retracted rows count only when the viewer can see them, so a year holding nothing but
 * retractions is not offered to the public.
 */
export async function listDetectionYears(includeRetracted: boolean): Promise<number[]> {
	const year = sql<number>`extract(year from ${incidents.observedOn})::int`;
	const rows = await db
		.selectDistinct({ year })
		.from(incidents)
		.where(includeRetracted ? undefined : isNull(incidents.deletedAt))
		.orderBy(desc(year));
	return rows.map((r) => Number(r.year));
}

export type StateOption = { usps: string; name: string };

/** A `state` query parameter as a USPS code ("wi" → "WI"), or null for anything else. */
export function parseState(param: string | null): string | null {
	const usps = param?.trim().toUpperCase();
	return usps && /^[A-Z]{2}$/.test(usps) ? usps : null;
}

/**
 * Every state with a detection of any disease, by name, for the table's state filter.
 * Like the years, it ignores the other filters, so the list does not shrink as they
 * change, and retracted rows count only for viewers who can see them.
 */
export async function listDetectionStates(includeRetracted: boolean): Promise<StateOption[]> {
	return db
		.selectDistinct({ usps: counties.stateUsps, name: counties.stateName })
		.from(incidents)
		.innerJoin(counties, eq(counties.fips, incidents.countyFips))
		.where(includeRetracted ? undefined : isNull(incidents.deletedAt))
		.orderBy(counties.stateName);
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
	/** Internal; never written to a file. The admin download looks coordinates up by it. */
	id: number;
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
 * Rows for the public CSV download: one disease or all (`null`), one year or all of them,
 * optionally one state.
 * Retracted detections are excluded, exactly as on the map.
 */
export async function getDetectionsForExport(
	diseaseSlug: string | null,
	year: number | null,
	stateUsps: string | null = null
): Promise<ExportRow[]> {
	const rows = await db
		.select({
			id: incidents.id,
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
				diseaseSlug === null ? undefined : eq(diseases.slug, diseaseSlug),
				isNull(incidents.deletedAt),
				year === null ? undefined : sql`extract(year from ${incidents.observedOn}) = ${year}`,
				stateUsps === null ? undefined : eq(counties.stateUsps, stateUsps)
			)
		)
		.orderBy(desc(incidents.observedOn), desc(incidents.id));

	return rows.map(({ reporterName, reporterAffiliation, ...r }) => ({
		...r,
		reportedBy:
			reporterName === null ? null : { name: reporterName, affiliation: reporterAffiliation }
	}));
}
