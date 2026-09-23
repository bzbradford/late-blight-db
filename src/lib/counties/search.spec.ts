import { describe, expect, it } from 'vitest';
import type { CountyOption } from '$lib/server/queries/admin';
import { countyLabel, searchCounties } from './search';

const c = (fips: string, name: string, stateUsps: string, stateName: string): CountyOption => ({
	fips,
	name,
	stateUsps,
	stateName
});

const COUNTIES = [
	c('55025', 'Dane', 'WI', 'Wisconsin'),
	c('19153', 'Polk', 'IA', 'Iowa'),
	c('27119', 'Polk', 'MN', 'Minnesota'),
	c('29189', 'St. Louis', 'MO', 'Missouri'),
	c('29510', 'St. Louis', 'MO', 'Missouri'),
	c('22071', 'Orleans', 'LA', 'Louisiana'),
	c('35013', 'Doña Ana', 'NM', 'New Mexico'),
	c('26077', 'Kalamazoo', 'MI', 'Michigan'),
	c('55001', 'Adams', 'WI', 'Wisconsin'),
	c('17137', 'Morgan', 'IL', 'Illinois')
];

const fips = (q: string) => searchCounties(COUNTIES, q).map((x) => x.fips);

describe('searchCounties', () => {
	it('matches the start of a county name, case-insensitively', () => {
		expect(fips('dan')).toEqual(['55025']);
		expect(fips('POLK')).toEqual(['19153', '27119']);
	});

	it('narrows by state name or abbreviation', () => {
		expect(fips('polk mn')).toEqual(['27119']);
		expect(fips('Polk, Iowa')).toEqual(['19153']);
	});

	it('ignores "County" and "Parish", which the table does not store', () => {
		expect(fips('Dane County')).toEqual(['55025']);
		expect(fips('orleans parish')).toEqual(['22071']);
	});

	it('treats St, St., and Saint alike, and ignores accents', () => {
		expect(fips('st louis')).toEqual(['29189', '29510']);
		expect(fips('saint louis mo')).toEqual(['29189', '29510']);
		expect(fips('dona ana')).toEqual(['35013']);
	});

	it('ranks name matches before state-only matches', () => {
		// "wi" starts no county name here, so only the state matches — alphabetical.
		expect(fips('wi')).toEqual(['55001', '55025']);
		// "mo": Morgan by name first, then the Missouri counties by state.
		expect(fips('mo')).toEqual(['17137', '29189', '29510']);
	});

	it('finds a county by its exact FIPS', () => {
		expect(fips('26077')).toEqual(['26077']);
		expect(fips('99999')).toEqual([]);
	});

	it('returns nothing for an empty query, and respects the limit', () => {
		expect(fips('   ')).toEqual([]);
		expect(searchCounties(COUNTIES, 'wi', 1)).toHaveLength(1);
	});

	it('labels a county as name and state', () => {
		expect(countyLabel(COUNTIES[0])).toBe('Dane, WI');
	});
});
