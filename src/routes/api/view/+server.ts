import { json } from '@sveltejs/kit';
import { listDiseases } from '$lib/server/queries/diseases';
import { loadView } from '$lib/server/view';
import type { RequestHandler } from './$types';

/**
 * Data for a disease-year, fetched by the page when the viewer switches either one.
 * The page keeps its view state out of the URL, so these switches cannot go through
 * `load` — see `$lib/state/view.svelte`.
 */
export const GET: RequestHandler = async ({ url }) => {
	const view = await loadView(
		await listDiseases(),
		url.searchParams.get('disease'),
		Number(url.searchParams.get('year'))
	);

	// Not cached: an admin who has just recorded a detection checks the public map
	// straight away, and a stale response would look like the save failed.
	return json(view, { headers: { 'cache-control': 'no-store' } });
};
