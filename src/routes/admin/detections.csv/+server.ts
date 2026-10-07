import { error } from '@sveltejs/kit';
import { EXPORT_COLUMNS } from '$lib/csv/columns';
import { toCsv } from '$lib/csv/io';
import { csvResponse, exportQuery, exportRecords } from '$lib/server/export';
import { getLocations } from '$lib/server/queries/admin';
import type { RequestHandler } from './$types';

/**
 * The admin download: the public one plus the private coordinates. Same filters as
 * `/detections.csv`. Admin-only (`ADMIN_ONLY_PATHS`), so `guardAdmin` refuses reporters
 * and visitors before this runs.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	// Private data: checked here too, not only by the guard.
	if (locals.user?.role !== 'admin') error(403, 'Only admins can download coordinates.');
	const { rows, fileName } = await exportQuery(url);
	const locations = await getLocations(rows.map((r) => r.id));
	return csvResponse(
		toCsv(exportRecords(rows, locations), EXPORT_COLUMNS),
		`${fileName}-with-coordinates`
	);
};
