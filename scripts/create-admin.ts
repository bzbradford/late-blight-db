/**
 * Provisions an admin account, resets any account's password, or deactivates one.
 *
 * There is no public registration. Day to day, admins invite people from `/admin/users`;
 * this script is for the first admin of a new deployment and for recovering a locked-out
 * one. It talks to Better Auth's server context rather than the sign-up endpoint, so it
 * works with `disableSignUp` on and produces exactly the same user/account rows the app
 * expects.
 *
 * Usage:
 *   pnpm create-admin --email jane@wisc.edu --name "Jane Doe"
 *   pnpm create-admin --email jane@wisc.edu --password "..."   # supply your own
 *   pnpm create-admin --email jane@wisc.edu --reset            # rotate the password
 *   pnpm create-admin --email jane@wisc.edu --deactivate       # remove access
 *   pnpm create-admin --email jane@wisc.edu --reactivate       # restore it
 *
 * `--deactivate` exists for the one case the app can't handle: under the seniority rule
 * nobody can deactivate the most senior admin, so if they leave, it's done here. It keeps
 * the app's invariant that there is always at least one active admin.
 */
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { and, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/lib/server/db/schema';
import { MIN_PASSWORD_LENGTH } from '../src/lib/validation/account';

const { values } = parseArgs({
	options: {
		email: { type: 'string' },
		name: { type: 'string' },
		password: { type: 'string' },
		reset: { type: 'boolean', default: false },
		deactivate: { type: 'boolean', default: false },
		reactivate: { type: 'boolean', default: false }
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

/**
 * Deactivate or reactivate, with the same effects and audit row as `/admin/users` —
 * the actor is null, which is how the audit log records "done from the command line".
 */
async function setActive(active: boolean) {
	const { user, session, invitations, auditLog } = schema;
	await db.transaction(async (tx) => {
		const [target] = await tx.select().from(user).where(eq(user.email, email!)).for('update');
		if (!target) throw new Error(`No account for ${email}.`);
		if (active === !target.deactivatedAt) {
			console.log(`\n${email} is already ${active ? 'active' : 'deactivated'}.\n`);
			return;
		}
		if (!active && target.role === 'admin') {
			const admins = await tx
				.select({ id: user.id })
				.from(user)
				.where(and(eq(user.role, 'admin'), isNull(user.deactivatedAt)))
				.for('update');
			if (admins.length === 1) throw new Error('That is the only active admin.');
		}
		await tx
			.update(user)
			.set({ deactivatedAt: active ? null : new Date() })
			.where(eq(user.id, target.id));
		if (!active) {
			await tx.delete(session).where(eq(session.userId, target.id));
			await tx
				.update(invitations)
				.set({ revokedAt: new Date() })
				.where(
					and(
						eq(invitations.userId, target.id),
						isNull(invitations.usedAt),
						isNull(invitations.revokedAt)
					)
				);
		}
		await tx.insert(auditLog).values({
			actorId: null,
			tableName: 'user',
			rowId: target.id,
			action: active ? 'reactivate' : 'deactivate'
		});
		console.log(`\n${active ? 'Reactivated' : 'Deactivated'} ${email}.\n`);
	});
}

try {
	if (values.deactivate || values.reactivate) {
		if (values.deactivate && values.reactivate)
			throw new Error('Pick one of --deactivate, --reactivate.');
		await setActive(values.reactivate);
		process.exit(0);
	}

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
		// A reset never changes the role; promote or demote from /admin/users.
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
		// This instance doesn't declare the app's extra user fields, so set the role
		// directly rather than trusting createUser to pass it through.
		await db
			.update(schema.user)
			.set({ role: 'admin', adminSince: new Date() })
			.where(eq(schema.user.id, user.id));
		console.log(`\nCreated admin account for ${email}`);
	}

	if (!values.password) {
		console.log(`Password: ${password}`);
		console.log('\nThis is shown once. Store it in a password manager now.');
		console.log('Rotate it later with: pnpm create-admin --email ' + email + ' --reset');
	}
	console.log();
} catch (err) {
	// Refusals are thrown as plain messages; print them without a stack trace.
	console.error(`\n${err instanceof Error ? err.message : String(err)}\n`);
	process.exitCode = 1;
} finally {
	await client.end();
}
