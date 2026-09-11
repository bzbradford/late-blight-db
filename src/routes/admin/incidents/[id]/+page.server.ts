import { error, fail, redirect } from '@sveltejs/kit';
import {
	countyExists,
	getIncident,
	listCounties,
	listFieldSuggestions,
	restoreIncident,
	retractIncident,
	updateIncident
} from '$lib/server/queries/admin';
import { listDiseases } from '$lib/server/queries/diseases';
import { hasErrors, parseIncident, today } from '$lib/validation/incident';
import type { Actions, PageServerLoad } from './$types';

function parseId(param: string): number {
	const id = Number(param);
	if (!Number.isInteger(id) || id <= 0) error(404, 'Not found');
	return id;
}

export const load: PageServerLoad = async ({ params }) => {
	const incident = await getIncident(parseId(params.id));
	if (!incident) error(404, 'Not found');

	const [diseases, counties, suggestions] = await Promise.all([
		listDiseases(),
		listCounties(),
		listFieldSuggestions()
	]);
	return { incident, diseases, counties, suggestions, maxDate: today() };
};

export const actions: Actions = {
	save: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { errors: {}, values: {} });
		const id = parseId(params.id);

		const data = await request.formData();
		const { values, errors } = parseIncident(data);

		if (!errors.countyFips && !(await countyExists(values.countyFips))) {
			errors.countyFips = 'That county is not in the database.';
		}

		if (hasErrors(errors)) return fail(400, { errors, values });

		await updateIncident(id, values, { id: locals.user.id });
		redirect(303, '/admin/incidents');
	},

	retract: async ({ params, locals }) => {
		if (!locals.user) return fail(401, { errors: {}, values: {} });
		await retractIncident(parseId(params.id), { id: locals.user.id });
		redirect(303, '/admin/incidents?includeDeleted=1');
	},

	restore: async ({ params, locals }) => {
		if (!locals.user) return fail(401, { errors: {}, values: {} });
		await restoreIncident(parseId(params.id), { id: locals.user.id });
		redirect(303, '/admin/incidents');
	}
};
