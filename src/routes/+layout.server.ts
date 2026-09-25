import { ROLE_LABELS } from '$lib/auth/roles';
import { listDiseases } from '$lib/server/queries/diseases';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		diseases: await listDiseases(),
		// Only these reach the layout — never the user's ID or email. The name and role are
		// the viewer's own, for "Signed in as". Which detections the viewer may edit is
		// decided per row on the server (`Detection.canEdit`).
		signedIn: Boolean(locals.user),
		isAdmin: locals.user?.role === 'admin',
		signedInAs: locals.user ? `${locals.user.name} (${ROLE_LABELS[locals.user.role]})` : null
	};
};
