import { listDiseases } from '$lib/server/queries/diseases';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		diseases: await listDiseases(),
		// Only ever the signed-in flag reaches the public layout — never the whole user.
		isAdmin: Boolean(locals.user)
	};
};
