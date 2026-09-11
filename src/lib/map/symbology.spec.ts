import { describe, expect, it } from 'vitest';
import { daysBetween, legendFor, symbologyMode, tokenFor, type CountyAggregate } from './symbology';

const TODAY = new Date(2026, 8, 11); // 2026-09-11, local time

function agg(first: string, last = first, count = 1): CountyAggregate {
	return { fips: '55025', firstDetection: first, lastDetection: last, count };
}

describe('symbologyMode', () => {
	it('uses the recency ramp for the current year', () => {
		expect(symbologyMode(2026, TODAY)).toBe('recency');
	});

	it('uses the timing ramp for a past year', () => {
		expect(symbologyMode(2025, TODAY)).toBe('timing');
	});
});

describe('daysBetween', () => {
	it('counts whole days', () => {
		expect(daysBetween('2026-09-11', TODAY)).toBe(0);
		expect(daysBetween('2026-09-04', TODAY)).toBe(7);
		expect(daysBetween('2026-08-12', TODAY)).toBe(30);
	});

	it('is unaffected by time of day', () => {
		const lateInDay = new Date(2026, 8, 11, 23, 59);
		expect(daysBetween('2026-09-10', lateInDay)).toBe(1);
	});
});

describe('tokenFor — recency', () => {
	it('returns null for a county with no detections', () => {
		expect(tokenFor(undefined, 'recency', TODAY)).toBeNull();
	});

	it('bins on the most recent detection, not the first', () => {
		// First detection is old, but the county was hit again three days ago.
		expect(tokenFor(agg('2026-06-01', '2026-09-08', 2), 'recency', TODAY)).toBe('--recency-7');
	});

	it.each([
		['2026-09-11', '--recency-7'],
		['2026-09-04', '--recency-7'],
		['2026-09-03', '--recency-14'],
		['2026-08-28', '--recency-14'],
		['2026-08-27', '--recency-30'],
		['2026-08-12', '--recency-30'],
		['2026-08-11', '--recency-old']
	])('%s falls in %s', (last, expected) => {
		expect(tokenFor(agg(last), 'recency', TODAY)).toBe(expected);
	});
});

describe('tokenFor — timing', () => {
	it('bins on the first detection, not the most recent', () => {
		// Arrived in June, still active in September — the ramp must say June.
		expect(tokenFor(agg('2025-06-15', '2025-09-30', 4), 'timing', TODAY)).toBe('--timing-2');
	});

	it.each([
		['2025-03-02', '--timing-1'],
		['2025-05-20', '--timing-1'],
		['2025-06-01', '--timing-2'],
		['2025-07-14', '--timing-3'],
		['2025-08-02', '--timing-4'],
		['2025-09-11', '--timing-5'],
		['2025-10-01', '--timing-6'],
		['2025-11-30', '--timing-6']
	])('%s falls in %s', (first, expected) => {
		expect(tokenFor(agg(first), 'timing', TODAY)).toBe(expected);
	});
});

describe('legendFor', () => {
	it('gives a distinct entry per bin, and swaps with the mode', () => {
		const recency = legendFor('recency');
		const timing = legendFor('timing');
		expect(recency).toHaveLength(4);
		expect(timing).toHaveLength(6);
		expect(new Set(recency.map((e) => e.token)).size).toBe(4);
		expect(new Set(timing.map((e) => e.token)).size).toBe(6);
	});

	it('covers every token tokenFor can return', () => {
		const legendTokens = new Set(
			[...legendFor('recency'), ...legendFor('timing')].map((e) => e.token)
		);
		const produced = [
			tokenFor(agg('2026-09-11'), 'recency', TODAY),
			tokenFor(agg('2026-09-03'), 'recency', TODAY),
			tokenFor(agg('2026-08-27'), 'recency', TODAY),
			tokenFor(agg('2026-01-01'), 'recency', TODAY),
			...['2025-04-01', '2025-06-01', '2025-07-01', '2025-08-01', '2025-09-01', '2025-12-01'].map(
				(d) => tokenFor(agg(d), 'timing', TODAY)
			)
		];
		for (const token of produced) {
			expect(token).not.toBeNull();
			expect(legendTokens).toContain(token!);
		}
	});
});
