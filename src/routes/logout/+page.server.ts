import { redirect } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async (event) => {
		// POST-only: a GET-triggerable sign-out can be fired by any embedded image.
		await auth.api.signOut({ headers: event.request.headers });
		redirect(303, '/');
	}
};
