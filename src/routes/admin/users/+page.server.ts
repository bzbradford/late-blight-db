import { fail } from '@sveltejs/kit';
import { canManageUser, isRole, viewerOf } from '$lib/auth/roles';
import {
	createInvite,
	createResetLink,
	deactivateUser,
	INVITE_TTL_DAYS,
	listPendingInvites,
	listUsers,
	reactivateUser,
	RESET_TTL_DAYS,
	revokeInvite,
	setEmail,
	setRole
} from '$lib/server/queries/users';
import { isEmail, normalizeEmail } from '$lib/validation/account';
import type { Actions, PageServerLoad } from './$types';

/** Admins only: guardAdmin refuses reporters for every page, action, and endpoint here. */
export const load: PageServerLoad = async ({ locals }) => {
	const [rows, invites] = await Promise.all([listUsers(), listPendingInvites()]);
	const me = locals.user!;
	const actor = { id: me.id, role: me.role, adminSince: me.adminSince ?? null };
	// Which rows get action buttons. The actions re-check this in their transactions.
	const users = rows.map((u) => ({ ...u, manageable: canManageUser(actor, u) }));
	return { users, invites, viewerId: me.id };
};

/**
 * The link is shown once, in the action result, and never stored in a readable form —
 * there is no way to see it again later, only to issue a new one.
 */
function linkFor(origin: string, token: string) {
	return `${origin}/invite/${token}`;
}

export const actions: Actions = {
	invite: async ({ request, locals, url }) => {
		const data = await request.formData();
		const email = normalizeEmail(data.get('email'));
		const role = data.get('role');
		if (!isEmail(email)) {
			return fail(400, { action: 'invite' as const, email, error: 'Enter a valid email address.' });
		}
		if (!isRole(role)) {
			return fail(400, { action: 'invite' as const, email, error: 'Choose a role.' });
		}

		const result = await createInvite(email, role, viewerOf(locals.user!));
		if ('error' in result)
			return fail(409, { action: 'invite' as const, email, error: result.error });
		return {
			action: 'link' as const,
			kind: 'invite' as const,
			email,
			link: linkFor(url.origin, result.token),
			days: INVITE_TTL_DAYS
		};
	},

	revoke: async ({ request, locals }) => {
		const id = Number((await request.formData()).get('id'));
		if (Number.isInteger(id) && id > 0) await revokeInvite(id, viewerOf(locals.user!));
		return { action: 'revoke' as const };
	},

	resetLink: async ({ request, locals, url }) => {
		const userId = String((await request.formData()).get('userId') ?? '');
		const result = await createResetLink(userId, viewerOf(locals.user!));
		if ('error' in result)
			return fail(400, { action: 'row' as const, userId, error: result.error });
		return {
			action: 'link' as const,
			kind: 'reset' as const,
			email: result.email,
			link: linkFor(url.origin, result.token),
			days: RESET_TTL_DAYS
		};
	},

	setRole: async ({ request, locals }) => {
		const data = await request.formData();
		const userId = String(data.get('userId') ?? '');
		const role = data.get('role');
		if (!isRole(role))
			return fail(400, { action: 'row' as const, userId, error: 'Choose a role.' });
		const refusal = await setRole(userId, role, viewerOf(locals.user!));
		if (refusal) return fail(400, { action: 'row' as const, userId, error: refusal });
		return { action: 'row' as const, userId };
	},

	deactivate: async ({ request, locals }) => {
		const userId = String((await request.formData()).get('userId') ?? '');
		const refusal = await deactivateUser(userId, viewerOf(locals.user!));
		if (refusal) return fail(400, { action: 'row' as const, userId, error: refusal });
		return { action: 'row' as const, userId };
	},

	setEmail: async ({ request, locals }) => {
		const data = await request.formData();
		const userId = String(data.get('userId') ?? '');
		const email = normalizeEmail(data.get('email'));
		if (!isEmail(email)) {
			return fail(400, { action: 'row' as const, userId, error: 'Enter a valid email address.' });
		}
		const refusal = await setEmail(userId, email, viewerOf(locals.user!));
		if (refusal) return fail(400, { action: 'row' as const, userId, error: refusal });
		return { action: 'row' as const, userId };
	},

	reactivate: async ({ request, locals }) => {
		const userId = String((await request.formData()).get('userId') ?? '');
		const refusal = await reactivateUser(userId, viewerOf(locals.user!));
		if (refusal) return fail(400, { action: 'row' as const, userId, error: refusal });
		return { action: 'row' as const, userId };
	}
};
