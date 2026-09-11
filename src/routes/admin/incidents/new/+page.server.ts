import { fail, redirect } from '@sveltejs/kit';
import {
	countyExists,
	createIncident,
	listCounties,
	listFieldSuggestions
} from '$lib/server/queries/admin';
import { listDiseases } from '$lib/server/queries/diseases';
import { hasErrors, parseIncident, today } from '$lib/validation/incident';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const [diseases, counties, suggestions] = await Promise.all([
		listDiseases(),
		listCounties(),
		listFieldSuggestions()
	]);
	return { diseases, counties, suggestions, maxDate: today() };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		// The layout guard already redirects anonymous visitors; this is the belt-and-braces
		// check so the action can never mutate without an actor to attribute it to.
		if (!locals.user) return fail(401, { errors: {}, values: {} });

		const data = await request.formData();
		const { values, errors } = parseIncident(data);

		// Shape is validated above; that the county actually exists needs the database.
		if (!errors.countyFips && !(await countyExists(values.countyFips))) {
			errors.countyFips = 'That county is not in the database.';
		}

		if (hasErrors(errors)) return fail(400, { errors, values });

		await createIncident(values, { id: locals.user.id });
		redirect(303, '/admin/incidents');
	}
};
