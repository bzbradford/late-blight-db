import { redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { building } from '$app/environment';
import { auth } from '$lib/server/auth';
import { svelteKitHandler } from 'better-auth/svelte-kit';

const handleBetterAuth: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

/**
 * The guard for everything under /admin — pages, form actions, and `+server.ts`
 * endpoints alike. It has to live here: a layout `load` guard runs only for page loads,
 * so on its own it would leave every form action and endpoint under /admin open.
 */
const guardAdmin: Handle = async ({ event, resolve }) => {
	const { pathname, search } = event.url;
	if ((pathname === '/admin' || pathname.startsWith('/admin/')) && !event.locals.user) {
		if (event.request.method === 'GET') {
			redirect(303, `/login?redirectTo=${encodeURIComponent(pathname + search)}`);
		}
		return new Response('Sign in required', { status: 401 });
	}
	return resolve(event);
};

export const handle: Handle = sequence(handleBetterAuth, guardAdmin);
