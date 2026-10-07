import { PUBLIC_EXPORT_COLUMNS } from '$lib/csv/columns';
import { toCsv } from '$lib/csv/io';
import { csvResponse, exportQuery, exportRecords } from '$lib/server/export';
import type { RequestHandler } from './$types';

/**
 * Public CSV download: `/detections.csv?disease=late-blight&year=2026` (`disease=all` and
 * `year=all` widen it; `state=WI` narrows it to one state).
 *
 * The import template's columns plus `reported_by`, which the importer ignores, so a
 * download can be edited and imported again, matching on `id`. Everything in it is already
 * public on the map. The private coordinates are left out; admins download them from
 * `/admin/detections.csv`.
 */
export const GET: RequestHandler = async ({ url }) => {
	const { rows, fileName } = await exportQuery(url);
	return csvResponse(toCsv(exportRecords(rows), PUBLIC_EXPORT_COLUMNS), fileName);
};
