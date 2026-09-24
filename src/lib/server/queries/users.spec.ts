import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, inArray, or } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { account, auditLog, invitations, session, user } from '$lib/server/db/schema';
import {
	acceptInvite,
	createInvite,
	createResetLink,
	findLink,
	INVITE_TTL_DAYS,
	RESET_TTL_DAYS,
	resetPassword
} from './users';

/**
 * Link expiry, against the development database. Expiry is compared with the app's
 * clock (`new Date()`), not Postgres's, so moving the clock with fake timers is a real
 * test of it — no seven-day wait, and no shortened TTL that isn't the one in production.
 */

const DAY = 24 * 60 * 60 * 1000;
const SECOND = 1000;
const PASSWORD = 'expiry-test-password-1';
const run = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const admin = { id: `expiry-admin-${run}`, role: 'admin' as const };
const reporter = { id: `expiry-reporter-${run}`, role: 'reporter' as const };
const inviteeEmail = `expiry-invitee-${run}@example.com`;
const ids = [admin.id, reporter.id];

function setClock(time: number) {
	// Only Date: the database driver's own timers must keep running.
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(time);
}

beforeAll(async () => {
	await db.insert(user).values([
		{
			id: admin.id,
			name: 'Expiry Admin',
			email: `expiry-admin-${run}@example.com`,
			emailVerified: true,
			role: 'admin',
			adminSince: new Date(0)
		},
		{
			id: reporter.id,
			name: 'Expiry Reporter',
			email: `expiry-reporter-${run}@example.com`,
			emailVerified: true,
			role: 'reporter'
		}
	]);
});

afterEach(() => {
	vi.useRealTimers();
});

afterAll(async () => {
	const invitee = await db.select({ id: user.id }).from(user).where(eq(user.email, inviteeEmail));
	const all = [...ids, ...invitee.map((u) => u.id)];
	await db.delete(auditLog).where(inArray(auditLog.actorId, all));
	await db
		.delete(invitations)
		.where(or(inArray(invitations.createdBy, all), inArray(invitations.userId, all)));
	await db.delete(session).where(inArray(session.userId, all));
	await db.delete(account).where(inArray(account.userId, all));
	await db.delete(user).where(inArray(user.id, all));
});

describe('invite links', () => {
	it(`work until ${INVITE_TTL_DAYS} days have passed, then never`, async () => {
		const start = Date.now();
		setClock(start);
		const created = await createInvite(inviteeEmail, 'reporter', admin);
		if (!('token' in created)) throw new Error(created.error);

		setClock(start + INVITE_TTL_DAYS * DAY - SECOND);
		expect(await findLink(created.token)).toMatchObject({ kind: 'invite', email: inviteeEmail });

		setClock(start + INVITE_TTL_DAYS * DAY + SECOND);
		expect(await findLink(created.token)).toBeNull();
		// Submitting the form anyway is refused too, not just the page.
		expect(
			await acceptInvite(created.token, { name: 'Late', affiliation: null }, PASSWORD)
		).toBeNull();
		const [invitee] = await db.select().from(user).where(eq(user.email, inviteeEmail));
		expect(invitee).toBeUndefined();
	});
});

describe('password reset links', () => {
	it('work before they expire', async () => {
		const start = Date.now();
		setClock(start);
		const created = await createResetLink(reporter.id, admin);
		if (!('token' in created)) throw new Error(created.error);

		setClock(start + RESET_TTL_DAYS * DAY - SECOND);
		expect(await resetPassword(created.token, PASSWORD)).toBe(created.email);
	});

	it(`stop working after ${RESET_TTL_DAYS} days`, async () => {
		const start = Date.now();
		setClock(start);
		const created = await createResetLink(reporter.id, admin);
		if (!('token' in created)) throw new Error(created.error);

		setClock(start + RESET_TTL_DAYS * DAY + SECOND);
		expect(await findLink(created.token)).toBeNull();
		expect(await resetPassword(created.token, PASSWORD)).toBeNull();
	});
});
