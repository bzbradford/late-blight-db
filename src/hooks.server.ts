import { error, redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { building } from '$app/environment';
import { auth } from '$lib/server/auth';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { isAdminOnlyPath, isRole } from '$lib/auth/roles';

const handleBetterAuth: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });

	// A deactivated account's sessions are deleted when it is deactivated; this covers
	// the moment in between, and any role value the app doesn't know.
	if (session && !session.user.deactivatedAt && isRole(session.user.role)) {
		event.locals.session = session.session;
		event.locals.user = { ...session.user, role: session.user.role };
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

/**
 * The guard for everything under /admin — pages, form actions, and `+server.ts`
 * endpoints alike. It has to live here: a layout `load` guard runs only for page loads,
 * so on its own it would leave every form action and endpoint under /admin open.
 *
 * Signed-in reporters and admins reach /admin; account management and CSV import
 * (`ADMIN_ONLY_PATHS`) are for admins only.
 */
const guardAdmin: Handle = async ({ event, resolve }) => {
	const { pathname, search } = event.url;
	if ((pathname === '/admin' || pathname.startsWith('/admin/')) && !event.locals.user) {
		if (event.request.method === 'GET') {
			redirect(303, `/login?redirectTo=${encodeURIComponent(pathname + search)}`);
		}
		return new Response('Sign in required', { status: 401 });
	}
	if (isAdminOnlyPath(pathname) && event.locals.user?.role !== 'admin') {
		if (event.request.method === 'GET') error(403, 'Only admins can open this page.');
		return new Response('Admins only', { status: 403 });
	}
	return resolve(event);
};

export const handle: Handle = sequence(handleBetterAuth, guardAdmin);
