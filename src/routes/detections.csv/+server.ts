import type { CsvRecord } from '$lib/csv/columns';
import { toCsv } from '$lib/csv/io';
import { getDetectionsForExport } from '$lib/server/queries/detections';
import { listDiseases } from '$lib/server/queries/diseases';
import type { RequestHandler } from './$types';

/**
 * Public CSV download: `/detections.csv?disease=late-blight&year=2026` (or `year=all`).
 *
 * Same columns as the import template, so a download can be edited and imported again,
 * matching on `id`. Everything in it is already public on the map.
 */
export const GET: RequestHandler = async ({ url }) => {
	const diseases = await listDiseases();
	const disease = diseases.find((d) => d.slug === url.searchParams.get('disease')) ?? diseases[0];

	const yearParam = url.searchParams.get('year');
	const year = yearParam === 'all' ? null : Number(yearParam) || new Date().getFullYear();

	const rows = await getDetectionsForExport(disease.slug, year);
	const records: CsvRecord[] = rows.map((r) => ({
		id: r.publicId,
		disease: r.diseaseSlug,
		county_fips: r.countyFips,
		state: r.stateUsps,
		county: r.countyName,
		observed_on: r.observedOn,
		reported_on: r.reportedOn ?? '',
		crop: r.crop ?? '',
		operation_type: r.operationType ?? '',
		strain: r.strain ?? '',
		source: r.source ?? '',
		comments: r.comments ?? ''
	}));

	return new Response(toCsv(records), {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="${disease.slug}-${year ?? 'all-years'}.csv"`,
			// Detections change as admins record them; always serve the current set.
			'cache-control': 'no-store'
		}
	});
};
