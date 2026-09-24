import { EXPORT_COLUMNS, type ExportRecord } from '$lib/csv/columns';
import { toCsv } from '$lib/csv/io';
import { getDetectionsForExport } from '$lib/server/queries/detections';
import { listDiseases } from '$lib/server/queries/diseases';
import { formatReporter } from '$lib/validation/account';
import type { RequestHandler } from './$types';

/**
 * Public CSV download: `/detections.csv?disease=late-blight&year=2026` (or `year=all`).
 *
 * The import template's columns plus `reported_by`, which the importer ignores, so a
 * download can be edited and imported again, matching on `id`. Everything in it is already public on the map.
 */
export const GET: RequestHandler = async ({ url }) => {
	const diseases = await listDiseases();
	const disease = diseases.find((d) => d.slug === url.searchParams.get('disease')) ?? diseases[0];

	const yearParam = url.searchParams.get('year');
	const year = yearParam === 'all' ? null : Number(yearParam) || new Date().getFullYear();

	const rows = await getDetectionsForExport(disease.slug, year);
	const records: ExportRecord[] = rows.map((r) => ({
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
		comments: r.comments ?? '',
		reported_by: r.reportedBy
			? `${r.imported ? 'Imported by ' : ''}${formatReporter(r.reportedBy)}`
			: ''
	}));

	return new Response(toCsv(records, EXPORT_COLUMNS), {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="${disease.slug}-${year ?? 'all-years'}.csv"`,
			// Detections change as admins record them; always serve the current set.
			'cache-control': 'no-store'
		}
	});
};
