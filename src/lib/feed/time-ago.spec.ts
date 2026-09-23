import { describe, expect, it } from 'vitest';
import { timeAgo } from './time-ago';

const TODAY = new Date(2026, 8, 23); // 2026-09-23, local time

describe('timeAgo', () => {
	it('says today for today, and for a date ahead of this clock', () => {
		expect(timeAgo('2026-09-23', TODAY)).toBe('today');
		expect(timeAgo('2026-09-24', TODAY)).toBe('today');
	});

	it('counts days up to 30, singular for one', () => {
		expect(timeAgo('2026-09-22', TODAY)).toBe('1 day ago');
		expect(timeAgo('2026-09-16', TODAY)).toBe('7 days ago');
		expect(timeAgo('2026-08-24', TODAY)).toBe('30 days ago');
	});

	it('switches to whole calendar months after 30 days', () => {
		expect(timeAgo('2026-08-23', TODAY)).toBe('1 month ago');
		expect(timeAgo('2026-07-24', TODAY)).toBe('1 month ago');
		expect(timeAgo('2026-07-23', TODAY)).toBe('2 months ago');
		expect(timeAgo('2025-09-24', TODAY)).toBe('11 months ago');
	});

	it('never says "0 months" just past the 30-day line', () => {
		// 31 days, but the day of month has not come round yet.
		expect(timeAgo('2026-03-30', new Date(2026, 3, 30))).toBe('1 month ago');
		expect(timeAgo('2026-01-30', new Date(2026, 2, 2))).toBe('1 month ago');
	});

	it('then whole years', () => {
		expect(timeAgo('2025-09-23', TODAY)).toBe('1 year ago');
		expect(timeAgo('2024-10-01', TODAY)).toBe('1 year ago');
		expect(timeAgo('2023-07-14', TODAY)).toBe('3 years ago');
	});
});
