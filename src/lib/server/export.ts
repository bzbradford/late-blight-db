import type { ExportRecord } from '$lib/csv/columns';
import type { Point } from '$lib/geo/coordinates';
import { getDetectionsForExport, parseState, type ExportRow } from '$lib/server/queries/detections';
import { listDiseases } from '$lib/server/queries/diseases';
import { formatReporter } from '$lib/validation/account';

/**
 * Download rows as CSV records. Both downloads build them here; only the admin one
 * passes coordinates, and the public one doesn't write those columns at all.
 */
export function exportRecords(
	rows: ExportRow[],
	locations: Map<number, Point> = new Map()
): ExportRecord[] {
	return rows.map((r) => {
		const location = locations.get(r.id);
		return {
			id: r.publicId,
			disease: r.diseaseSlug,
			county_fips: r.countyFips,
			state: r.stateUsps,
			county: r.countyName,
			latitude: location ? String(location.lat) : '',
			longitude: location ? String(location.lon) : '',
			observed_on: r.observedOn,
			reported_on: r.reportedOn,
			crop: r.crop ?? '',
			operation_type: r.operationType ?? '',
			strain: r.strain ?? '',
			source: r.source ?? '',
			comments: r.comments ?? '',
			reported_by: r.reportedBy
				? `${r.imported ? 'Imported by ' : ''}${formatReporter(r.reportedBy)}`
				: ''
		};
	});
}

/** "late-blight-wi-2026", "all-diseases-all-years", … */
export function exportFileName(disease: string | null, state: string | null, year: number | null) {
	return [disease ?? 'all-diseases', state?.toLowerCase(), year ?? 'all-years']
		.filter(Boolean)
		.join('-');
}

/** The filters both downloads take, and the rows they select. */
export async function exportQuery(url: URL) {
	const diseases = await listDiseases();
	const diseaseParam = url.searchParams.get('disease');
	const disease =
		diseaseParam === 'all' ? null : (diseases.find((d) => d.slug === diseaseParam) ?? diseases[0]);

	const yearParam = url.searchParams.get('year');
	const year = yearParam === 'all' ? null : Number(yearParam) || new Date().getFullYear();

	const state = parseState(url.searchParams.get('state'));

	const rows = await getDetectionsForExport(disease?.slug ?? null, year, state);
	return { rows, fileName: exportFileName(disease?.slug ?? null, state, year) };
}

export function csvResponse(csv: string, fileName: string) {
	return new Response(csv, {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="${fileName}.csv"`,
			// Detections change as admins record them; always serve the current set.
			'cache-control': 'no-store'
		}
	});
}
