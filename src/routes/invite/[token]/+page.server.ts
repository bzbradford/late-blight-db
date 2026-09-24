import { fail, redirect } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { acceptInvite, findLink, resetPassword } from '$lib/server/queries/users';
import { checkNewPassword, parseProfile } from '$lib/validation/account';
import type { Actions, PageServerLoad } from './$types';

/**
 * Where an invite or reset link lands. Public: the token is the credential. It is 256
 * random bits, so guessing one isn't a realistic attack and no extra rate limit is needed.
 *
 * An unknown, used, revoked, or expired link all show the same "no longer valid" page.
 */
export const load: PageServerLoad = async ({ params }) => {
	return { link: await findLink(params.token) };
};

async function signIn(email: string, password: string, headers: Headers) {
	// The sveltekitCookies plugin sets the session cookie on the active event.
	await auth.api.signInEmail({ body: { email, password }, headers });
}

export const actions: Actions = {
	default: async ({ request, params }) => {
		const link = await findLink(params.token);
		if (!link) return fail(410, { expired: true as const });

		const data = await request.formData();
		const password = String(data.get('password') ?? '');
		const passwordError = checkNewPassword(password, String(data.get('confirmPassword') ?? ''));

		if (link.kind === 'reset') {
			if (passwordError) return fail(400, { passwordError });
			const email = await resetPassword(params.token, password);
			if (!email) return fail(410, { expired: true as const });
			await signIn(email, password, request.headers);
			redirect(303, '/admin');
		}

		const { values, errors } = parseProfile(data);
		if (passwordError || errors.name || errors.affiliation) {
			return fail(400, { values, errors, passwordError });
		}
		const email = await acceptInvite(params.token, values, password);
		if (!email) return fail(410, { expired: true as const });
		await signIn(email, password, request.headers);
		redirect(303, '/admin');
	}
};
