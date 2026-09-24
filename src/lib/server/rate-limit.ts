/**
 * Counts failures per key in fixed windows, in memory.
 *
 * The app runs as one adapter-node process, so a module-level Map is the whole store:
 * nothing to configure, and a restart forgetting the counts is harmless. Only
 * failures count, so someone who types their password right is never slowed down.
 */
export class FailureLimiter {
	readonly #max: number;
	readonly #windowMs: number;
	readonly #entries = new Map<string, { count: number; resetAt: number }>();

	constructor(max: number, windowMs: number) {
		this.#max = max;
		this.#windowMs = windowMs;
	}

	/** Milliseconds until `key` may try again, or 0 if it may try now. */
	retryAfter(key: string, now = Date.now()): number {
		const entry = this.#entries.get(key);
		if (!entry || now >= entry.resetAt) return 0;
		return entry.count >= this.#max ? entry.resetAt - now : 0;
	}

	recordFailure(key: string, now = Date.now()): void {
		const entry = this.#entries.get(key);
		if (!entry || now >= entry.resetAt) {
			this.#prune(now);
			this.#entries.set(key, { count: 1, resetAt: now + this.#windowMs });
		} else {
			entry.count++;
		}
	}

	reset(key: string): void {
		this.#entries.delete(key);
	}

	/** Drops expired windows so a stream of distinct keys can't grow the map forever. */
	#prune(now: number) {
		if (this.#entries.size < 1000) return;
		for (const [key, entry] of this.#entries) if (now >= entry.resetAt) this.#entries.delete(key);
	}
}

const MINUTE = 60_000;

/**
 * Sign-in limits. One address from one client gets 5 wrong passwords per 5 minutes;
 * one client gets 20 across all addresses per 15 minutes, which stops spraying a
 * common password over the handful of known accounts. Nothing is keyed on the address
 * alone: that would let anyone lock a specialist out by typing their email.
 */
const perAccount = new FailureLimiter(5, 5 * MINUTE);
const perClient = new FailureLimiter(20, 15 * MINUTE);

const accountKey = (client: string, email: string) => `${client}|${email}`;

/** Milliseconds until this client may try this address again, or 0. */
export function signInRetryAfter(client: string, email: string, now = Date.now()): number {
	return Math.max(
		perAccount.retryAfter(accountKey(client, email), now),
		perClient.retryAfter(client, now)
	);
}

export function recordSignInFailure(client: string, email: string, now = Date.now()): void {
	perAccount.recordFailure(accountKey(client, email), now);
	perClient.recordFailure(client, now);
}

/** A successful sign-in clears that address's count (not the client's). */
export function recordSignInSuccess(client: string, email: string): void {
	perAccount.reset(accountKey(client, email));
}
