import { env } from '$env/dynamic/private';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { dev } from '$app/environment';
import { db } from '$lib/server/db';

export const auth = betterAuth({
	baseURL: env.ORIGIN,
	secret: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'pg' }),

	emailAndPassword: {
		enabled: true,
		/**
		 * There is no public registration. Admin accounts are extension specialists,
		 * provisioned deliberately with `pnpm create-admin`. Leaving the sign-up route
		 * open would let anyone create an account that can edit detection records.
		 */
		disableSignUp: true,
		minPasswordLength: 12
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
		useSecureCookies: !dev
	},

	plugins: [
		sveltekitCookies(getRequestEvent) // must stay last in the array
	]
});
