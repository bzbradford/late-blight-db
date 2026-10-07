import { describe, expect, it } from 'vitest';
import type { FeatureCollection } from 'geojson';
import { emptyRecord, TEMPLATE_EXAMPLE_COMMENT, type CsvRecord } from '$lib/csv/columns';
import { countyShapes } from '$lib/geo/locate';
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
	{ fips: '29510', name: 'St. Louis', stateUsps: 'MO', stateName: 'Missouri' },
	{ fips: 'C2466', name: 'Montréal', stateUsps: 'QC', stateName: 'Québec' },
	{ fips: 'C3506', name: 'Ottawa', stateUsps: 'ON', stateName: 'Ontario' },
	{ fips: '55105', name: 'Rock', stateUsps: 'WI', stateName: 'Wisconsin' }
];
const index = buildCountyIndex(COUNTIES);
const DISEASES = [
	{ id: 1, slug: 'late-blight', name: 'Late blight' },
	{ id: 2, slug: 'cucurbit-downy-mildew', name: 'Cucurbit downy mildew' }
];
/** Two counties as rectangles: Dane around 43.1°N 89.4°W, Rock directly south of it. */
const SHAPES = countyShapes({
	type: 'FeatureCollection',
	features: [
		['55025', 'Dane County', 43.0, 43.4],
		['55105', 'Rock County', 42.5, 43.0]
	].map(([fips, name, south, north]) => ({
		type: 'Feature',
		properties: { fips, name, state_name: 'Wisconsin' },
		geometry: {
			type: 'Polygon',
			coordinates: [
				[
					[-89.8, south],
					[-89.0, south],
					[-89.0, north],
					[-89.8, north],
					[-89.8, south]
				]
			]
		}
	})) as FeatureCollection['features']
});
const context = { diseases: DISEASES, counties: index, shapes: SHAPES, todayIso: '2026-09-22' };

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
			error: 'county_fips 02020 is not a county on this map.'
		});
	});

	it('resolves a Canadian census division key, in either case', () => {
		expect(resolveCounty(rec({ county_fips: 'C3506' }), index)).toEqual({ county: COUNTIES[6] });
		expect(resolveCounty(rec({ county_fips: ' c3506 ' }), index)).toEqual({
			county: COUNTIES[6]
		});
	});

	it('rejects a bare CDUID, which would read as a FIPS missing its zero', () => {
		expect(resolveCounty(rec({ county_fips: '3506' }), index)).toEqual({
			error: 'county_fips 03506 is not a county on this map.'
		});
		expect(resolveCounty(rec({ county_fips: 'C35' }), index)).toEqual({
			error: 'county_fips "C35" is not a 5-digit FIPS code or a Canadian census division (C3506).'
		});
	});

	it('matches province and division names without their accents', () => {
		expect(resolveCounty(rec({ state: 'Quebec', county: 'Montreal' }), index)).toEqual({
			county: COUNTIES[5]
		});
		expect(resolveCounty(rec({ state: 'QC', county: 'Montréal' }), index)).toEqual({
			county: COUNTIES[5]
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
			error: '"HI" is not a state or province on this map.'
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

	it('gives a row with no reported_on its observed_on date', () => {
		const base = { disease: 'late-blight', county_fips: '55025', observed_on: '2026-09-19' };
		const blank = buildRow(2, rec(base), context);
		if (isRowError(blank)) throw new Error(blank.messages.join());
		expect(blank.values.reportedOn).toBe('2026-09-19');

		const given = buildRow(3, rec({ ...base, reported_on: '2026-09-21' }), context);
		if (isRowError(given)) throw new Error(given.messages.join());
		expect(given.values.reportedOn).toBe('2026-09-21');
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
				'county_fips 99999 is not a county on this map.',
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

	describe('coordinates', () => {
		const base = { disease: 'late-blight', observed_on: '2026-09-19' };
		const ok = (overrides: Partial<CsvRecord>) => {
			const result = buildRow(2, rec({ ...base, ...overrides }), context);
			if (isRowError(result)) throw new Error(result.messages.join(' '));
			return result;
		};
		const errors = (overrides: Partial<CsvRecord>) => {
			const result = buildRow(2, rec({ ...base, ...overrides }), context);
			return isRowError(result) ? result.messages : [];
		};

		it('leaves stored coordinates alone when the columns are blank', () => {
			expect(ok({ county_fips: '55025' }).values.location).toBeUndefined();
		});

		it('keeps coordinates that fall in the named county', () => {
			const row = ok({ county_fips: '55025', latitude: '43.0731', longitude: '-89.4012' });
			expect(row.values.location).toEqual({ lat: 43.0731, lon: -89.4012 });
		});

		it('chooses the county from coordinates when the row names none', () => {
			const row = ok({ latitude: '43.0731', longitude: '-89.4012' });
			expect(row.values.countyFips).toBe('55025');
			expect(row.label.county).toBe('Dane, WI');
		});

		it('refuses coordinates in another county, saying which', () => {
			expect(errors({ county_fips: '55025', latitude: '42.7', longitude: '-89.4' })).toEqual([
				'latitude/longitude: These coordinates are in Rock County, Wisconsin, not Dane County, Wisconsin.'
			]);
		});

		it('sends a point a few km outside the county to the form, which can confirm it', () => {
			const [message] = errors({ county_fips: '55025', latitude: '43.44', longitude: '-89.4' });
			expect(message).toMatch(/4\.4 km outside Dane County, Wisconsin/);
			expect(message).toMatch(/through the form/);
			expect(errors({ latitude: '43.44', longitude: '-89.4' })[0]).toMatch(/through the form/);
		});

		it('needs both columns, as decimal degrees', () => {
			expect(errors({ county_fips: '55025', latitude: '43.0731' })).toEqual([
				'Give both latitude and longitude, or neither.'
			]);
			expect(errors({ county_fips: '55025', latitude: 'north', longitude: '-89.4' })[0]).toMatch(
				/^latitude\/longitude: Enter latitude, longitude/
			);
		});
	});
});
