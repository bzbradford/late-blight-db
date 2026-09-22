import { describe, expect, it } from 'vitest';
import { tooltipContent } from './tooltip';

const DANE = { name: 'Dane County', stateName: 'Wisconsin' };

describe('tooltipContent', () => {
	it('names the county and state, and says the year when there are no detections', () => {
		expect(tooltipContent(DANE, 2026, 0, undefined, 'en-US')).toEqual({
			title: 'Dane County, Wisconsin',
			lines: ['No detections in 2026']
		});
	});

	it('uses the selected year, not the current one', () => {
		expect(tooltipContent(DANE, 2019, 0, undefined).lines).toEqual(['No detections in 2019']);
	});

	it('gives the count and the most recent date, crop, and strain', () => {
		const latest = { observedOn: '2026-09-19', crop: 'Potato', strain: 'US-23' };
		expect(tooltipContent(DANE, 2026, 2, latest, 'en-US')).toEqual({
			title: 'Dane County, Wisconsin',
			lines: ['2 detections in 2026', 'Most recent: Sep 19, 2026', 'Potato · US-23']
		});
	});

	it('singularises one detection', () => {
		const latest = { observedOn: '2026-08-01', crop: 'Tomato', strain: null };
		expect(tooltipContent(DANE, 2026, 1, latest, 'en-US').lines[0]).toBe('1 detection in 2026');
	});

	it('omits missing crop and strain rather than printing placeholders', () => {
		const onlyStrain = { observedOn: '2026-08-01', crop: null, strain: 'US-23' };
		expect(tooltipContent(DANE, 2026, 1, onlyStrain, 'en-US').lines[2]).toBe('US-23');

		const neither = { observedOn: '2026-08-01', crop: null, strain: null };
		expect(tooltipContent(DANE, 2026, 1, neither, 'en-US').lines).toHaveLength(2);
	});

	it('does not shift the date across a timezone boundary', () => {
		// A UTC parse of "2026-01-01" reads as Dec 31 anywhere west of Greenwich.
		const latest = { observedOn: '2026-01-01', crop: null, strain: null };
		expect(tooltipContent(DANE, 2026, 1, latest, 'en-US').lines[1]).toBe(
			'Most recent: Jan 1, 2026'
		);
	});
});
