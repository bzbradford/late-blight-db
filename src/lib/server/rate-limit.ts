import { and, eq, lte, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { signInFailures } from '$lib/server/db/schema';

/**
 * Counts failures per key in fixed windows, in Postgres (`sign_in_failures`).
 *
 * Memory would do for one adapter-node process, but not on a serverless host, where each
 * instance would keep its own counts and lose them when it stops. A failure is one
 * upsert, and only failures count, so someone who types their password right is never
 * slowed down.
 */
export class FailureLimiter {
	readonly #name: string;
	readonly #max: number;
	readonly #windowMs: number;

	/** `name` keeps this limiter's rows apart from another's in the shared table. */
	constructor(name: string, max: number, windowMs: number) {
		this.#name = name;
		this.#max = max;
		this.#windowMs = windowMs;
	}

	/** Milliseconds until `key` may try again, or 0 if it may try now. */
	async retryAfter(key: string, now = Date.now()): Promise<number> {
		const [entry] = await db
			.select({ count: signInFailures.count, resetAt: signInFailures.resetAt })
			.from(signInFailures)
			.where(and(eq(signInFailures.limiter, this.#name), eq(signInFailures.key, key)));
		if (!entry || now >= entry.resetAt.getTime()) return 0;
		return entry.count >= this.#max ? entry.resetAt.getTime() - now : 0;
	}

	/** One statement, so concurrent failures from the same key each count. */
	async recordFailure(key: string, now = Date.now()): Promise<void> {
		const at = new Date(now);
		const resetAt = new Date(now + this.#windowMs);
		// ISO strings: drizzle leaves a Date inside `sql` unserialized, and postgres-js rejects it.
		const expired = sql`${signInFailures.resetAt} <= ${at.toISOString()}`;
		await db
			.insert(signInFailures)
			.values({ limiter: this.#name, key, count: 1, resetAt })
			.onConflictDoUpdate({
				target: [signInFailures.limiter, signInFailures.key],
				set: {
					count: sql`case when ${expired} then 1 else ${signInFailures.count} + 1 end`,
					resetAt: sql`case when ${expired} then ${resetAt.toISOString()}::timestamptz else ${signInFailures.resetAt} end`
				}
			});
		// Drops expired windows so a stream of distinct keys can't grow the table forever.
		await db
			.delete(signInFailures)
			.where(and(eq(signInFailures.limiter, this.#name), lte(signInFailures.resetAt, at)));
	}

	async reset(key: string): Promise<void> {
		await db
			.delete(signInFailures)
			.where(and(eq(signInFailures.limiter, this.#name), eq(signInFailures.key, key)));
	}
}

const MINUTE = 60_000;

/**
 * Sign-in limits. One address from one client gets 5 wrong passwords per 5 minutes;
 * one client gets 20 across all addresses per 15 minutes, which stops spraying a
 * common password over the handful of known accounts. Nothing is keyed on the address
 * alone: that would let anyone lock a specialist out by typing their email.
 */
const perAccount = new FailureLimiter('account', 5, 5 * MINUTE);
const perClient = new FailureLimiter('client', 20, 15 * MINUTE);

const accountKey = (client: string, email: string) => `${client}|${email}`;

/** Milliseconds until this client may try this address again, or 0. */
export async function signInRetryAfter(
	client: string,
	email: string,
	now = Date.now()
): Promise<number> {
	const [account, all] = await Promise.all([
		perAccount.retryAfter(accountKey(client, email), now),
		perClient.retryAfter(client, now)
	]);
	return Math.max(account, all);
}

export async function recordSignInFailure(
	client: string,
	email: string,
	now = Date.now()
): Promise<void> {
	await perAccount.recordFailure(accountKey(client, email), now);
	await perClient.recordFailure(client, now);
}

/** A successful sign-in clears that address's count (not the client's). */
export async function recordSignInSuccess(client: string, email: string): Promise<void> {
	await perAccount.reset(accountKey(client, email));
}
