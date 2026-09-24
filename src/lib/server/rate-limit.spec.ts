import { describe, expect, it } from 'vitest';
import {
	FailureLimiter,
	recordSignInFailure,
	recordSignInSuccess,
	signInRetryAfter
} from './rate-limit';

describe('FailureLimiter', () => {
	it('allows up to max failures, then blocks until the window ends', () => {
		const limiter = new FailureLimiter(3, 1000);
		for (let i = 0; i < 3; i++) {
			expect(limiter.retryAfter('a', 0)).toBe(0);
			limiter.recordFailure('a', 0);
		}
		expect(limiter.retryAfter('a', 400)).toBe(600);
		expect(limiter.retryAfter('a', 1000)).toBe(0);
	});

	it('starts a fresh window once the old one has passed', () => {
		const limiter = new FailureLimiter(2, 1000);
		limiter.recordFailure('a', 0);
		limiter.recordFailure('a', 1000);
		expect(limiter.retryAfter('a', 1000)).toBe(0);
		limiter.recordFailure('a', 1500);
		expect(limiter.retryAfter('a', 1500)).toBe(500);
	});

	it('keeps keys apart, and reset clears one', () => {
		const limiter = new FailureLimiter(1, 1000);
		limiter.recordFailure('a', 0);
		expect(limiter.retryAfter('a', 0)).toBeGreaterThan(0);
		expect(limiter.retryAfter('b', 0)).toBe(0);
		limiter.reset('a');
		expect(limiter.retryAfter('a', 0)).toBe(0);
	});
});

describe('sign-in limits', () => {
	it('blocks an address from a client after 5 failures, but not other addresses', () => {
		const client = 'client-1';
		for (let i = 0; i < 5; i++) recordSignInFailure(client, 'a@example.com', 0);
		expect(signInRetryAfter(client, 'a@example.com', 0)).toBe(5 * 60_000);
		expect(signInRetryAfter(client, 'b@example.com', 0)).toBe(0);
		expect(signInRetryAfter('client-2', 'a@example.com', 0)).toBe(0);
	});

	it('blocks a client after 20 failures across addresses', () => {
		const client = 'client-3';
		for (let i = 0; i < 20; i++) recordSignInFailure(client, `user${i}@example.com`, 0);
		expect(signInRetryAfter(client, 'fresh@example.com', 0)).toBe(15 * 60_000);
	});

	it('a success clears the address count but not the client count', () => {
		const client = 'client-4';
		for (let i = 0; i < 4; i++) recordSignInFailure(client, 'a@example.com', 0);
		recordSignInSuccess(client, 'a@example.com');
		recordSignInFailure(client, 'a@example.com', 0);
		expect(signInRetryAfter(client, 'a@example.com', 0)).toBe(0);
	});
});
