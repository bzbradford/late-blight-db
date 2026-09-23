import { listIncidents, listIncidentYears } from '$lib/server/queries/admin';
import { listDiseases } from '$lib/server/queries/diseases';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const diseaseId = Number(url.searchParams.get('diseaseId')) || undefined;
	const year = Number(url.searchParams.get('year')) || undefined;
	const includeDeleted = url.searchParams.get('includeDeleted') === '1';

	const [diseases, years, incidents] = await Promise.all([
		listDiseases(),
		listIncidentYears(),
		listIncidents({ diseaseId, year, includeDeleted })
	]);
	return { diseases, years, incidents, filters: { diseaseId, year, includeDeleted } };
};
