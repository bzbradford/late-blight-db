import { listDiseases } from '$lib/server/queries/diseases';
import { loadView } from '$lib/server/view';
import { viewerOf } from '$lib/auth/roles';
import { isIsoDate } from '$lib/validation/incident';
import type { PageServerLoad } from './$types';

/**
 * Query parameters are read here only on arrival — they are how a share link opens in
 * the view it describes. The page strips them from the address bar once it has
 * hydrated, and later switches go through `/api/view`.
 */
export const load: PageServerLoad = async ({ url, locals }) => {
	const view = await loadView(
		await listDiseases(),
		url.searchParams.get('disease'),
		Number(url.searchParams.get('year')),
		locals.user ? viewerOf(locals.user) : null
	);

	// Only counties that have detections can be selected, so a stale link naming an
	// empty county arrives with nothing selected rather than an empty selection.
	const county = url.searchParams.get('county');
	const selectedCounty = view.aggregates.some((a) => a.fips === county) ? county : null;

	// Labels are on by default, over the default window. A share link either fixes the
	// start date (`since`, accepted only inside the season shown) or turns them off.
	const since = url.searchParams.get('since');
	const labels =
		url.searchParams.get('labels') === 'off'
			? ('off' as const)
			: since && isIsoDate(since) && since.startsWith(`${view.activeYear}-`)
				? { since }
				: ('default' as const);

	return { ...view, selectedCounty, labels };
};
