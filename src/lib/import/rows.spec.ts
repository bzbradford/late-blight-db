import { describe, expect, it } from 'vitest';
import { emptyRecord, TEMPLATE_EXAMPLE_COMMENT, type CsvRecord } from '$lib/csv/columns';
import {
	buildCountyIndex,
	buildRow,
	isRowError,
	normalizeCountyName,
	resolveCounty,
	type CountyRef
} from './rows';

const COUNTIES: CountyRef[] = [
	{ fips: '55025', name: 'Dane', stateUsps: 'WI', stateName: 'Wisconsin' },
	{ fips: '01001', name: 'Autauga', stateUsps: 'AL', stateName: 'Alabama' },
	{ fips: '51159', name: 'Richmond', stateUsps: 'VA', stateName: 'Virginia' },
	{ fips: '51760', name: 'Richmond', stateUsps: 'VA', stateName: 'Virginia' },
	{ fips: '29510', name: 'St. Louis', stateUsps: 'MO', stateName: 'Missouri' }
];
const index = buildCountyIndex(COUNTIES);
const DISEASES = [
	{ id: 1, slug: 'late-blight', name: 'Late blight' },
	{ id: 2, slug: 'cucurbit-downy-mildew', name: 'Cucurbit downy mildew' }
];
const context = { diseases: DISEASES, counties: index, todayIso: '2026-09-22' };

function rec(overrides: Partial<CsvRecord>): CsvRecord {
	return { ...emptyRecord(), ...overrides };
}

describe('normalizeCountyName', () => {
	it('ignores case, spacing, and a trailing County/Parish', () => {
		expect(normalizeCountyName('  Dane   County ')).toBe('dane');
		expect(normalizeCountyName('Orleans Parish')).toBe('orleans');
	});

	it('treats Saint, St and St. alike', () => {
		expect(normalizeCountyName('Saint Louis')).toBe('st. louis');
		expect(normalizeCountyName('St Louis')).toBe('st. louis');
		expect(normalizeCountyName('St. Louis')).toBe('st. louis');
	});
});

describe('resolveCounty', () => {
	it('resolves by FIPS', () => {
		expect(resolveCounty(rec({ county_fips: '55025' }), index)).toEqual({ county: COUNTIES[0] });
	});

	it('restores the leading zero Excel strips from a FIPS code', () => {
		expect(resolveCounty(rec({ county_fips: '1001' }), index)).toEqual({ county: COUNTIES[1] });
	});

	it('rejects a FIPS outside the table', () => {
		expect(resolveCounty(rec({ county_fips: '02020' }), index)).toEqual({
			error: 'county_fips 02020 is not a continental US county.'
		});
	});

	it('resolves by state and county name, with either state spelling', () => {
		expect(resolveCounty(rec({ state: 'WI', county: 'Dane County' }), index)).toEqual({
			county: COUNTIES[0]
		});
		expect(resolveCounty(rec({ state: 'wisconsin', county: 'dane' }), index)).toEqual({
			county: COUNTIES[0]
		});
	});

	it('refuses to guess between two counties with the same name', () => {
		const result = resolveCounty(rec({ state: 'VA', county: 'Richmond' }), index);
		expect(result).toEqual({
			error: '"Richmond, VA" matches 2 counties (51159, 51760). Use county_fips to say which.'
		});
	});

	it('flags a FIPS that contradicts the state and county given alongside it', () => {
		const result = resolveCounty(
			rec({ county_fips: '55025', state: 'AL', county: 'Autauga' }),
			index
		);
		expect(result).toEqual({
			error: 'county_fips 55025 is Dane, WI, but state/county say "Autauga, AL".'
		});
	});

	it('reports an unknown county or state', () => {
		expect(resolveCounty(rec({ state: 'WI', county: 'Atlantis' }), index)).toEqual({
			error: 'No county named "Atlantis" in WI. Use county_fips instead.'
		});
		expect(resolveCounty(rec({ state: 'HI', county: 'Maui' }), index)).toEqual({
			error: '"HI" is not a continental US state.'
		});
	});
});

describe('buildRow', () => {
	it('builds validated, normalised values', () => {
		const result = buildRow(
			2,
			rec({
				id: 'B7K2M',
				disease: 'Late blight',
				county_fips: '55025',
				observed_on: '2026-09-19',
				crop: '  sweet   corn '
			}),
			context
		);
		if (isRowError(result)) throw new Error(result.messages.join());
		expect(result.publicId).toBe('b7k2m');
		expect(result.values).toMatchObject({
			diseaseId: 1,
			countyFips: '55025',
			observedOn: '2026-09-19',
			crop: 'Sweet corn'
		});
		expect(result.label).toEqual({ disease: 'Late blight', county: 'Dane, WI' });
	});

	it('collects every problem in a row, not just the first', () => {
		const result = buildRow(
			7,
			rec({ id: 'nope!', disease: 'rust', county_fips: '99999', observed_on: '2099-01-01' }),
			context
		);
		expect(result).toEqual({
			row: 7,
			messages: [
				'id "nope!" is not a detection ID.',
				'disease "rust" is not recognised (use one of: late-blight, cucurbit-downy-mildew).',
				'county_fips 99999 is not a continental US county.',
				'observed_on: The observation date cannot be in the future.'
			]
		});
	});

	it("refuses the template's example row", () => {
		const result = buildRow(
			2,
			rec({
				disease: 'late-blight',
				county_fips: '55025',
				observed_on: '2026-07-15',
				comments: TEMPLATE_EXAMPLE_COMMENT
			}),
			context
		);
		expect(result).toEqual({
			row: 2,
			messages: ["This is the template's example row. Delete it before importing."]
		});
	});
});
