import { describe, expect, it } from 'vitest';
import { feedSections } from './sections';

const TODAY = new Date(2026, 8, 11); // 2026-09-11, local time

const d = (observedOn: string) => ({ observedOn });

describe('feedSections — recency', () => {
	it('matches the legend windows, newest first, and splits at 7/8, 14/15, 30/31 days', () => {
		const sections = feedSections(
			['2026-09-04', '2026-09-03', '2026-08-28', '2026-08-27', '2026-08-12', '2026-08-11'].map(d),
			'recency',
			TODAY
		);
		expect(sections.map((s) => [s.label, s.items.map((i) => i.observedOn)])).toEqual([
			['Within 7 days', ['2026-09-04']],
			['8–14 days', ['2026-09-03', '2026-08-28']],
			['15–30 days', ['2026-08-27', '2026-08-12']],
			['More than 30 days', ['2026-08-11']]
		]);
	});

	it('keeps empty windows so the feed can say nothing was reported', () => {
		const sections = feedSections([d('2026-01-05')], 'recency', TODAY);
		expect(sections).toHaveLength(4);
		expect(sections.slice(0, 3).every((s) => s.items.length === 0)).toBe(true);
	});
});

describe('feedSections — timing', () => {
	it('uses the month bins, latest month first, folding the season ends', () => {
		const sections = feedSections(
			['2025-11-02', '2025-10-01', '2025-07-15', '2025-05-31', '2025-03-01'].map(d),
			'timing',
			TODAY
		);
		expect(sections.map((s) => s.label)).toEqual([
			'October or later',
			'September',
			'August',
			'July',
			'June',
			'May or earlier'
		]);
		expect(sections[0].items.map((i) => i.observedOn)).toEqual(['2025-11-02', '2025-10-01']);
		expect(sections[3].items.map((i) => i.observedOn)).toEqual(['2025-07-15']);
		expect(sections[5].items.map((i) => i.observedOn)).toEqual(['2025-05-31', '2025-03-01']);
	});
});
