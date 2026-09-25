import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { auth, authHeaders } from '$lib/server/auth';
import { recordSignInFailure, recordSignInSuccess, signInRetryAfter } from '$lib/server/rate-limit';
import type { Actions, PageServerLoad } from './$types';

/**
 * Where to go after signing in. Only a path on this site: browsers read `//host` and
 * `/\host` as another origin (and drop tabs and newlines first), which would make the
 * sign-in page an open redirect.
 */
function afterSignIn(url: URL) {
	const to = url.searchParams.get('redirectTo');
	return to && /^\/(?![/\\])[^\\\s]*$/.test(to) ? to : '/detections';
}

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.user) redirect(303, afterSignIn(url));
	return {};
};

export const actions: Actions = {
	default: async (event) => {
		const data = await event.request.formData();
		const email = String(data.get('email') ?? '')
			.trim()
			.toLowerCase();
		const password = String(data.get('password') ?? '');

		if (!email || !password) {
			return fail(400, { email, error: 'Enter your email address and password.' });
		}

		// Better Auth's limiter only sees requests to its own HTTP handler, and this is a
		// server-side call, so the form is limited here. Behind a proxy the client address
		// comes from ADDRESS_HEADER / XFF_DEPTH (adapter-node); on Vercel, from the platform.
		const client = event.getClientAddress();
		const wait = await signInRetryAfter(client, email);
		if (wait > 0) {
			const minutes = Math.ceil(wait / 60_000);
			return fail(429, {
				email,
				error: `Too many attempts. Try again in ${minutes === 1 ? 'a minute' : `${minutes} minutes`}.`
			});
		}

		try {
			// The sveltekitCookies plugin sets the session cookie on the active event.
			await auth.api.signInEmail({ body: { email, password }, headers: authHeaders(event) });
		} catch (error) {
			if (error instanceof APIError) {
				await recordSignInFailure(client, email);
				// Deliberately uniform: distinguishing "no such account" from "wrong
				// password" would confirm which addresses have admin accounts.
				return fail(401, { email, error: 'Incorrect email address or password.' });
			}
			throw error;
		}
		await recordSignInSuccess(client, email);

		redirect(303, afterSignIn(event.url));
	}
};
