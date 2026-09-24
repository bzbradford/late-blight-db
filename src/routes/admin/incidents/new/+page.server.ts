import { fail, redirect } from '@sveltejs/kit';
import {
	countyExists,
	createIncident,
	findSameDayDetections,
	listCounties,
	listFieldSuggestions
} from '$lib/server/queries/admin';
import { listDiseases } from '$lib/server/queries/diseases';
import { hasErrors, parseIncident, today } from '$lib/validation/incident';
import { viewerOf } from '$lib/auth/roles';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const [diseases, counties, suggestions] = await Promise.all([
		listDiseases(),
		listCounties(),
		listFieldSuggestions()
	]);
	return { diseases, counties, suggestions, maxDate: today() };
};

type Duplicate = { id: number; publicId: string; crop: string | null; strain: string | null };

export const actions: Actions = {
	default: async ({ request, locals }) => {
		// The layout guard already redirects anonymous visitors; this is the belt-and-braces
		// check so the action can never mutate without an actor to attribute it to.
		if (!locals.user) return fail(401, { errors: {}, values: {}, duplicates: [] as Duplicate[] });

		const data = await request.formData();
		const { values, errors } = parseIncident(data);

		// Shape is validated above; that the county actually exists needs the database.
		if (!errors.countyFips && !(await countyExists(values.countyFips))) {
			errors.countyFips = 'That county is not in the database.';
		}

		if (hasErrors(errors)) return fail(400, { errors, values, duplicates: [] as Duplicate[] });

		// A likely duplicate is a warning, not a refusal: two confirmations on one day in
		// one county can be real (different crops or fields). The admin decides.
		if (data.get('confirmDuplicate') !== 'yes') {
			const same = await findSameDayDetections(values);
			if (same.length) {
				const duplicates: Duplicate[] = same.map(({ id, publicId, crop, strain }) => ({
					id,
					publicId,
					crop,
					strain
				}));
				return fail(409, { errors, values, duplicates });
			}
		}

		await createIncident(values, viewerOf(locals.user));
		redirect(303, '/admin');
	}
};
