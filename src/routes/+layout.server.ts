import { listDiseases } from '$lib/server/queries/diseases';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		diseases: await listDiseases(),
		// Only these two flags reach the public layout — never the user. Which detections
		// the viewer may edit is decided per row on the server (`Detection.canEdit`).
		signedIn: Boolean(locals.user),
		isAdmin: locals.user?.role === 'admin'
	};
};
