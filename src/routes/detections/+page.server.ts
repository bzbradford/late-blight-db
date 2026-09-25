import { viewerOf } from '$lib/auth/roles';
import { listReporters } from '$lib/server/queries/admin';
import {
	listDetectionRows,
	listDetectionYears,
	type DetectionFilters
} from '$lib/server/queries/detections';
import type { PageServerLoad } from './$types';

/**
 * The detections table, public. Signed-in viewers also get the "Reported by" filter
 * (its option values are user IDs, so it never reaches the public) and retracted rows.
 * Filters live in the query string like any ordinary page; sorting and paging happen in
 * the browser.
 */
export const load: PageServerLoad = async ({ url, locals }) => {
	const viewer = locals.user ? viewerOf(locals.user) : null;
	const params = url.searchParams;

	const filters: DetectionFilters = {
		diseaseSlug: params.get('disease') || undefined,
		year: Number(params.get('year')) || undefined,
		includeRetracted: viewer ? params.get('retracted') === '1' : undefined,
		reportedBy: viewer ? params.get('reportedBy') || undefined : undefined
	};

	const [years, reporters, detections] = await Promise.all([
		listDetectionYears(viewer !== null),
		viewer ? listReporters() : Promise.resolve([]),
		listDetectionRows(filters, viewer)
	]);

	return { years, reporters, detections, viewerId: viewer?.id ?? null, filters };
};
