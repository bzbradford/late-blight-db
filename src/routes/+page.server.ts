import { listDiseases } from '$lib/server/queries/diseases';
import { loadView } from '$lib/server/view';
import type { PageServerLoad } from './$types';

/**
 * Query parameters are read here only on arrival — they are how a share link opens in
 * the view it describes. The page strips them from the address bar once it has
 * hydrated, and later switches go through `/api/view`.
 */
export const load: PageServerLoad = async ({ url }) => {
	const view = await loadView(
		await listDiseases(),
		url.searchParams.get('disease'),
		Number(url.searchParams.get('year'))
	);

	// Only counties that have detections can be selected, so a stale link naming an
	// empty county arrives with nothing selected rather than an empty selection.
	const county = url.searchParams.get('county');
	const selectedCounty = view.aggregates.some((a) => a.fips === county) ? county : null;

	return { ...view, selectedCounty };
};
