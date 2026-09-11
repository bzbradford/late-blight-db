import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

/**
 * Single guard for the whole admin area. Every route nested under /admin inherits it,
 * so a new admin page cannot be added without protection by forgetting a check.
 */
export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		const redirectTo = encodeURIComponent(url.pathname + url.search);
		redirect(303, `/login?redirectTo=${redirectTo}`);
	}
	return { user: { name: locals.user.name, email: locals.user.email } };
};
