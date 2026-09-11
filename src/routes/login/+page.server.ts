import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { auth } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.user) redirect(303, url.searchParams.get('redirectTo') ?? '/admin');
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

		try {
			// The sveltekitCookies plugin sets the session cookie on the active event.
			await auth.api.signInEmail({ body: { email, password }, headers: event.request.headers });
		} catch (error) {
			if (error instanceof APIError) {
				// Deliberately uniform: distinguishing "no such account" from "wrong
				// password" would confirm which addresses have admin accounts.
				const tooMany = error.status === 429;
				return fail(tooMany ? 429 : 401, {
					email,
					error: tooMany
						? 'Too many attempts. Wait a minute and try again.'
						: 'Incorrect email address or password.'
				});
			}
			throw error;
		}

		const redirectTo = event.url.searchParams.get('redirectTo');
		redirect(303, redirectTo?.startsWith('/') ? redirectTo : '/admin');
	}
};
