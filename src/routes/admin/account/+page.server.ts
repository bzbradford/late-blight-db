import { fail } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { auth, authHeaders } from '$lib/server/auth';
import { recordPasswordChange, updateProfile } from '$lib/server/queries/users';
import { checkNewPassword, parseProfile } from '$lib/validation/account';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// guardAdmin has already refused anonymous requests.
	const user = locals.user!;
	return {
		account: {
			name: user.name,
			affiliation: user.affiliation ?? null,
			email: user.email,
			role: user.role
		}
	};
};

export const actions: Actions = {
	/**
	 * Not Better Auth's `/update-user`: every extra user field is `input: false` there, so
	 * that endpoint can't touch `role`. Name and affiliation are saved here instead.
	 */
	profile: async ({ request, locals }) => {
		const { values, errors } = parseProfile(await request.formData());
		if (errors.name || errors.affiliation) {
			return fail(400, { action: 'profile' as const, values, errors });
		}
		await updateProfile(locals.user!.id, values);
		return { action: 'profile' as const, saved: true };
	},

	password: async (event) => {
		const { request, locals } = event;
		const data = await request.formData();
		const currentPassword = String(data.get('currentPassword') ?? '');
		const newPassword = String(data.get('newPassword') ?? '');
		const problem = checkNewPassword(newPassword, String(data.get('confirmPassword') ?? ''));
		if (problem) return fail(400, { action: 'password' as const, error: problem });

		try {
			// Signs out every other session; this one continues with a fresh cookie.
			await auth.api.changePassword({
				body: { currentPassword, newPassword, revokeOtherSessions: true },
				headers: authHeaders(event)
			});
		} catch (error) {
			if (error instanceof APIError) {
				return fail(400, {
					action: 'password' as const,
					error:
						error.status === 429
							? 'Too many attempts. Wait a minute and try again.'
							: 'Your current password is incorrect.'
				});
			}
			throw error;
		}
		await recordPasswordChange(locals.user!.id);
		return { action: 'password' as const, saved: true };
	}
};
