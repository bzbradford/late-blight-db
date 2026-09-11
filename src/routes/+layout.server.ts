import { listDiseases } from '$lib/server/queries/diseases';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async () => {
	return { diseases: await listDiseases() };
};
