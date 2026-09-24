import { env } from '$env/dynamic/private';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import type { RequestEvent } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/auth.schema';
import { MIN_PASSWORD_LENGTH } from '$lib/validation/account';

/**
 * Better Auth reads the client address from this header, which only `authHeaders` sets.
 * Without it Better Auth finds no address it trusts (behind a proxy there is no single
 * `x-forwarded-for` value) and rate-limits every client out of one shared bucket.
 */
const CLIENT_IP_HEADER = 'x-lateblight-client-ip';

/**
 * The request's headers for a Better Auth call, carrying the client address SvelteKit
 * resolved (from `ADDRESS_HEADER` / `XFF_DEPTH` behind a proxy). Any copy of the
 * header the client sent is replaced. Use this, not `request.headers`, for `auth.api`
 * calls that start a session, so the session records the real address.
 */
export function authHeaders(event: Pick<RequestEvent, 'request' | 'getClientAddress'>) {
	const headers = new Headers(event.request.headers);
	headers.set(CLIENT_IP_HEADER, event.getClientAddress());
	return headers;
}

export const auth = betterAuth({
	baseURL: env.ORIGIN,
	secret: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'pg' }),

	emailAndPassword: {
		enabled: true,
		/**
		 * There is no public registration. Accounts come from an admin's invitation
		 * (`/admin/users`) or from `pnpm create-admin`. Leaving the sign-up route open
		 * would let anyone create an account that can edit detection records.
		 */
		disableSignUp: true,
		minPasswordLength: MIN_PASSWORD_LENGTH
	},

	user: {
		/**
		 * Every field is `input: false`: Better Auth's own `/update-user` endpoint accepts
		 * any field that allows input, and a reporter must not be able to make themselves
		 * an admin. Profile changes go through `/admin/account`; the rest through
		 * `/admin/users`.
		 */
		additionalFields: {
			role: { type: 'string', required: true, defaultValue: 'reporter', input: false },
			affiliation: { type: 'string', required: false, input: false },
			deactivatedAt: { type: 'date', required: false, input: false },
			lastSignInAt: { type: 'date', required: false, input: false },
			// When they last became an admin; null for reporters. Seniority: an admin can act
			// on another admin's account only if they became an admin first. See roles.ts.
			adminSince: { type: 'date', required: false, input: false }
		}
	},

	/**
	 * Profile and password changes go through `/admin/account`, which writes an audit row
	 * for each. Closing Better Auth's own HTTP endpoints for them means there is no
	 * unaudited route to the same change. (Server-side `auth.api` calls are unaffected.)
	 */
	disabledPaths: ['/update-user', '/change-password'],

	databaseHooks: {
		session: {
			create: {
				/**
				 * A deactivated account can't start a session. Returning false makes sign-in
				 * fail with the same error as a wrong password, so a deactivated address
				 * reads like any other failed attempt.
				 */
				before: async (session) => {
					const [row] = await db
						.select({ deactivatedAt: user.deactivatedAt })
						.from(user)
						.where(eq(user.id, session.userId))
						.limit(1);
					if (!row || row.deactivatedAt) return false;
				},
				/** For the users page. Sessions end and are deleted, so they can't say this. */
				after: async (session) => {
					await db
						.update(user)
						.set({ lastSignInAt: new Date() })
						.where(eq(user.id, session.userId));
				}
			}
		}
	},

	session: {
		// Long enough that a specialist entering reports across a season is not
		// constantly re-authenticating; short enough that a forgotten login lapses.
		expiresIn: 60 * 60 * 24 * 14,
		updateAge: 60 * 60 * 24
	},

	rateLimit: {
		enabled: true,
		window: 60,
		max: 100,
		customRules: {
			// Password guessing is the realistic attack against a handful of known
			// accounts, so sign-in is limited far more tightly than everything else.
			'/sign-in/email': { window: 60, max: 5 }
		}
	},

	advanced: {
		// Plain HTTP in local development; the deployment sits behind TLS.
		useSecureCookies: !dev,
		// Set by `authHeaders` from SvelteKit's resolved address, never taken from the client.
		ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] }
	},

	plugins: [
		sveltekitCookies(getRequestEvent) // must stay last in the array
	]
});
