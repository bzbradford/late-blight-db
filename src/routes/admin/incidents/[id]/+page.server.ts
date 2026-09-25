import { error, fail, redirect } from '@sveltejs/kit';
import {
	countyExists,
	deleteIncident,
	getIncident,
	listCounties,
	listFieldSuggestions,
	restoreIncident,
	retractIncident,
	updateIncident
} from '$lib/server/queries/admin';
import { listDiseases } from '$lib/server/queries/diseases';
import { hasErrors, parseIncident, today } from '$lib/validation/incident';
import { canDeleteIncident, canEditIncident, viewerOf } from '$lib/auth/roles';
import type { Actions, PageServerLoad } from './$types';

function parseId(param: string): number {
	const id = Number(param);
	if (!Number.isInteger(id) || id <= 0) error(404, 'Not found');
	return id;
}

/**
 * Reporters change only their own detections. Checked up front so a refusal is a 403
 * rather than a validation error; the mutations check again inside their transactions.
 */
async function editable(param: string, user: App.Locals['user']) {
	const incident = await getIncident(parseId(param));
	if (!incident) error(404, 'Not found');
	if (!canEditIncident(user ? viewerOf(user) : null, incident.createdBy)) {
		error(403, 'Only the person who entered this detection, or an admin, can change it.');
	}
	return incident;
}

export const load: PageServerLoad = async ({ params, locals }) => {
	const incident = await editable(params.id, locals.user);

	const [diseases, counties, suggestions] = await Promise.all([
		listDiseases(),
		listCounties(),
		listFieldSuggestions()
	]);
	const canDelete = canDeleteIncident(locals.user ? viewerOf(locals.user) : null);
	return { incident, diseases, counties, suggestions, maxDate: today(), canDelete };
};

export const actions: Actions = {
	save: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { errors: {}, values: {} });
		const { id } = await editable(params.id, locals.user);

		const data = await request.formData();
		const { values, errors } = parseIncident(data);

		if (!errors.countyFips && !(await countyExists(values.countyFips))) {
			errors.countyFips = 'That county is not in the database.';
		}

		if (hasErrors(errors)) return fail(400, { errors, values });

		await updateIncident(id, values, viewerOf(locals.user));
		redirect(303, '/detections');
	},

	retract: async ({ params, locals }) => {
		if (!locals.user) return fail(401, { errors: {}, values: {} });
		const { id } = await editable(params.id, locals.user);
		await retractIncident(id, viewerOf(locals.user));
		redirect(303, '/admin?includeDeleted=1');
	},

	restore: async ({ params, locals }) => {
		if (!locals.user) return fail(401, { errors: {}, values: {} });
		const { id } = await editable(params.id, locals.user);
		await restoreIncident(id, viewerOf(locals.user));
		redirect(303, '/detections');
	},

	delete: async ({ params, locals }) => {
		if (!locals.user) return fail(401, { errors: {}, values: {} });
		const { id } = await editable(params.id, locals.user);
		await deleteIncident(id, viewerOf(locals.user));
		redirect(303, '/admin?includeDeleted=1');
	}
};
