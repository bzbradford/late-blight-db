import { afterAll, describe, expect, it } from 'vitest';
import { like } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { signInFailures } from '$lib/server/db/schema';
import {
	FailureLimiter,
	recordSignInFailure,
	recordSignInSuccess,
	signInRetryAfter
} from './rate-limit';

/**
 * Against the development database, like `queries/users.spec.ts`. Every key carries this
 * run's tag, so rows a failed run left behind can't count toward this one.
 */
const run = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const limiterName = (name: string) => `${run}-${name}`;

afterAll(async () => {
	await db.delete(signInFailures).where(like(signInFailures.key, `${run}%`));
	await db.delete(signInFailures).where(like(signInFailures.limiter, `${run}%`));
});

describe('FailureLimiter', () => {
	it('allows up to max failures, then blocks until the window ends', async () => {
		const limiter = new FailureLimiter(limiterName('max'), 3, 1000);
		for (let i = 0; i < 3; i++) {
			expect(await limiter.retryAfter('a', 0)).toBe(0);
			await limiter.recordFailure('a', 0);
		}
		expect(await limiter.retryAfter('a', 400)).toBe(600);
		expect(await limiter.retryAfter('a', 1000)).toBe(0);
	});

	it('starts a fresh window once the old one has passed', async () => {
		const limiter = new FailureLimiter(limiterName('window'), 2, 1000);
		await limiter.recordFailure('a', 0);
		await limiter.recordFailure('a', 1000);
		expect(await limiter.retryAfter('a', 1000)).toBe(0);
		await limiter.recordFailure('a', 1500);
		expect(await limiter.retryAfter('a', 1500)).toBe(500);
	});

	it('keeps keys apart, and reset clears one', async () => {
		const limiter = new FailureLimiter(limiterName('keys'), 1, 1000);
		await limiter.recordFailure('a', 0);
		expect(await limiter.retryAfter('a', 0)).toBeGreaterThan(0);
		expect(await limiter.retryAfter('b', 0)).toBe(0);
		await limiter.reset('a');
		expect(await limiter.retryAfter('a', 0)).toBe(0);
	});

	it('keeps limiters apart', async () => {
		const one = new FailureLimiter(limiterName('one'), 1, 1000);
		const two = new FailureLimiter(limiterName('two'), 1, 1000);
		await one.recordFailure('a', 0);
		expect(await one.retryAfter('a', 0)).toBeGreaterThan(0);
		expect(await two.retryAfter('a', 0)).toBe(0);
	});

	it('counts every one of concurrent failures', async () => {
		const limiter = new FailureLimiter(limiterName('concurrent'), 5, 1000);
		await Promise.all(Array.from({ length: 5 }, () => limiter.recordFailure('a', 0)));
		expect(await limiter.retryAfter('a', 0)).toBe(1000);
	});
});

describe('sign-in limits', () => {
	it('blocks an address from a client after 5 failures, but not other addresses', async () => {
		const client = `${run}-client-1`;
		for (let i = 0; i < 5; i++) await recordSignInFailure(client, 'a@example.com', 0);
		expect(await signInRetryAfter(client, 'a@example.com', 0)).toBe(5 * 60_000);
		expect(await signInRetryAfter(client, 'b@example.com', 0)).toBe(0);
		expect(await signInRetryAfter(`${run}-client-2`, 'a@example.com', 0)).toBe(0);
	});

	it('blocks a client after 20 failures across addresses', async () => {
		const client = `${run}-client-3`;
		for (let i = 0; i < 20; i++) await recordSignInFailure(client, `user${i}@example.com`, 0);
		expect(await signInRetryAfter(client, 'fresh@example.com', 0)).toBe(15 * 60_000);
	});

	it('a success clears the address count but not the client count', async () => {
		const client = `${run}-client-4`;
		for (let i = 0; i < 4; i++) await recordSignInFailure(client, 'a@example.com', 0);
		await recordSignInSuccess(client, 'a@example.com');
		await recordSignInFailure(client, 'a@example.com', 0);
		expect(await signInRetryAfter(client, 'a@example.com', 0)).toBe(0);
	});
});
