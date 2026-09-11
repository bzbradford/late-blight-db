/**
 * Provisions or resets an admin account.
 *
 * There is no public registration — this script is the only way an account comes into
 * existence. It talks to Better Auth's server context rather than the sign-up endpoint,
 * so it works with `disableSignUp` on and produces exactly the same user/account rows
 * the app expects.
 *
 * Usage:
 *   pnpm create-admin --email jane@wisc.edu --name "Jane Doe"
 *   pnpm create-admin --email jane@wisc.edu --password "..."   # supply your own
 *   pnpm create-admin --email jane@wisc.edu --reset            # rotate the password
 */
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/lib/server/db/schema';

/** Must match `emailAndPassword.minPasswordLength` in src/lib/server/auth.ts. */
const MIN_PASSWORD_LENGTH = 12;

const { values } = parseArgs({
	options: {
		email: { type: 'string' },
		name: { type: 'string' },
		password: { type: 'string' },
		reset: { type: 'boolean', default: false }
	}
});

const email = values.email?.trim().toLowerCase();
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
	console.error('Provide a valid address: --email jane@wisc.edu');
	process.exit(1);
}

if (values.password && values.password.length < MIN_PASSWORD_LENGTH) {
	console.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
	process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL;
const BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET;
if (!DATABASE_URL) throw new Error('DATABASE_URL is not set');
if (!BETTER_AUTH_SECRET) throw new Error('BETTER_AUTH_SECRET is not set');

/** 24 URL-safe characters — comfortably past the minimum, easy to copy. */
function generatePassword() {
	return randomBytes(18).toString('base64url');
}

const client = postgres(DATABASE_URL);
const db = drizzle(client, { schema });

const auth = betterAuth({
	secret: BETTER_AUTH_SECRET,
	baseURL: process.env.ORIGIN ?? 'http://localhost:5173',
	database: drizzleAdapter(db, { provider: 'pg' }),
	emailAndPassword: { enabled: true, minPasswordLength: MIN_PASSWORD_LENGTH }
});

try {
	const ctx = await auth.$context;
	const existing = await ctx.internalAdapter.findUserByEmail(email);
	const password = values.password ?? generatePassword();
	const hash = await ctx.password.hash(password);

	if (existing) {
		if (!values.reset) {
			console.error(
				`An account already exists for ${email}.\n` + 'Pass --reset to set a new password for it.'
			);
			process.exit(1);
		}
		await ctx.internalAdapter.updatePassword(existing.user.id, hash);
		console.log(`\nPassword reset for ${email}`);
	} else {
		const user = await ctx.internalAdapter.createUser({
			email,
			name: values.name?.trim() || email,
			emailVerified: true
		});
		await ctx.internalAdapter.createAccount({
			userId: user.id,
			providerId: 'credential',
			accountId: user.id,
			password: hash
		});
		console.log(`\nCreated admin account for ${email}`);
	}

	if (!values.password) {
		console.log(`Password: ${password}`);
		console.log('\nThis is shown once. Store it in a password manager now.');
		console.log('Rotate it later with: pnpm create-admin --email ' + email + ' --reset');
	}
	console.log();
} finally {
	await client.end();
}
