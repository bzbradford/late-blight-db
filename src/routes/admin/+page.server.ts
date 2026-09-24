import { listIncidents, listIncidentYears, listReporters } from '$lib/server/queries/admin';
import { canEditIncident, viewerOf } from '$lib/auth/roles';
import { listDiseases } from '$lib/server/queries/diseases';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	const diseaseId = Number(url.searchParams.get('diseaseId')) || undefined;
	const year = Number(url.searchParams.get('year')) || undefined;
	const includeDeleted = url.searchParams.get('includeDeleted') === '1';
	const reportedBy = url.searchParams.get('reportedBy') || undefined;

	const [diseases, years, reporters, rows] = await Promise.all([
		listDiseases(),
		listIncidentYears(),
		listReporters(),
		listIncidents({ diseaseId, year, includeDeleted, reportedBy })
	]);

	// guardAdmin has already refused anonymous requests.
	const viewer = viewerOf(locals.user!);
	const incidents = rows.map(({ createdBy, ...r }) => ({
		...r,
		canEdit: canEditIncident(viewer, createdBy)
	}));
	return {
		diseases,
		years,
		reporters,
		incidents,
		viewerId: viewer.id,
		filters: { diseaseId, year, includeDeleted, reportedBy }
	};
};
