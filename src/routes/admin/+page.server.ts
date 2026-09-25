import { redirect } from '@sveltejs/kit';
import { listDiseases } from '$lib/server/queries/diseases';
import type { PageServerLoad } from './$types';

/**
 * The detection list moved to the public /detections, where signed-in viewers also get
 * editing and retractions. Old links and bookmarks land on the same filters there.
 */
export const load: PageServerLoad = async ({ url }) => {
	const old = url.searchParams;
	// Built for the redirect only, not reactive state.
	const params = new URLSearchParams();

	const diseaseId = Number(old.get('diseaseId'));
	if (diseaseId) {
		const disease = (await listDiseases()).find((d) => d.id === diseaseId);
		if (disease) params.set('disease', disease.slug);
	}
	for (const key of ['year', 'reportedBy']) {
		const value = old.get(key);
		if (value) params.set(key, value);
	}
	if (old.get('includeDeleted') === '1') params.set('retracted', '1');

	redirect(303, `/detections${params.size ? `?${params}` : ''}`);
};
