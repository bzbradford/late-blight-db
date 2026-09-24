import { describe, expect, it } from 'vitest';
import { CSV_COLUMNS, emptyRecord, escapeCell, unescapeCell, type CsvRecord } from './columns';
import { parseCsv, toCsv } from './io';

function record(overrides: Partial<CsvRecord>): CsvRecord {
	return { ...emptyRecord(), ...overrides };
}

describe('formula escaping', () => {
	it('neutralises cells a spreadsheet would run as formulas', () => {
		expect(escapeCell('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`);
		expect(escapeCell('+1')).toBe(`'+1`);
		expect(escapeCell('-1')).toBe(`'-1`);
		expect(escapeCell('@SUM(A1)')).toBe(`'@SUM(A1)`);
		expect(escapeCell('\tx')).toBe(`'\tx`);
	});

	it('leaves ordinary text alone', () => {
		expect(escapeCell('Potato')).toBe('Potato');
		expect(escapeCell('US-23')).toBe('US-23');
		expect(escapeCell('')).toBe('');
	});

	it('round-trips, and keeps an apostrophe the author actually wrote', () => {
		for (const v of ['=1+1', '-dash', 'plain', "'quoted", "'"]) {
			expect(unescapeCell(escapeCell(v))).toBe(v);
		}
	});
});

describe('toCsv / parseCsv', () => {
	const rows = [
		record({
			id: 'b7k2m',
			disease: 'late-blight',
			county_fips: '55025',
			state: 'WI',
			county: 'Dane',
			observed_on: '2026-09-19',
			crop: 'Potato',
			comments: 'Line one\nline two, with "quotes"'
		}),
		record({
			disease: 'late-blight',
			county_fips: '36011',
			observed_on: '2026-09-03',
			comments: '=cmd|calc'
		})
	];

	it('round-trips records, including quotes, commas, line breaks, and formula text', () => {
		const parsed = parseCsv(toCsv(rows, CSV_COLUMNS));
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.rows.map((r) => r.record)).toEqual(rows);
	});

	it('writes a byte-order mark and neutralises formulas in the file itself', () => {
		const text = toCsv(rows, CSV_COLUMNS);
		expect(text.startsWith('\uFEFF')).toBe(true);
		expect(text).toContain(`'=cmd|calc`);
	});

	it('numbers rows as a spreadsheet does, counting blank rows and multi-line cells once', () => {
		const text =
			'disease,county_fips,observed_on,comments\n' +
			'late-blight,55025,2026-09-01,"two\nlines"\n' +
			',,,\n' +
			'late-blight,55025,2026-09-02,\n';
		const parsed = parseCsv(text);
		if (!parsed.ok) throw new Error(parsed.errors.join());
		expect(parsed.rows.map((r) => r.row)).toEqual([2, 4]);
	});

	it('matches headers case-insensitively and ignores unknown columns', () => {
		const parsed = parseCsv(
			'Disease,COUNTY_FIPS,Observed_On,Notes\nlate-blight,55025,2026-09-01,x\n'
		);
		if (!parsed.ok) throw new Error(parsed.errors.join());
		expect(parsed.rows[0].record.county_fips).toBe('55025');
	});

	it('accepts state + county instead of county_fips', () => {
		expect(parseCsv('disease,state,county,observed_on\n').ok).toBe(true);
	});

	it('reports missing required columns', () => {
		const parsed = parseCsv('disease,county\nlate-blight,Dane\n');
		expect(parsed.ok).toBe(false);
		if (parsed.ok) return;
		expect(parsed.errors).toEqual([
			'The file has no "observed_on" column.',
			'The file needs a "county_fips" column, or both "state" and "county".'
		]);
	});
});
