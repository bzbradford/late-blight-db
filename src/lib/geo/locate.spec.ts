import { readFileSync } from 'node:fs';
import type { Feature, FeatureCollection } from 'geojson';
import { feature } from 'topojson-client';
import { describe, expect, it } from 'vitest';
import {
	checkLocation,
	correctedPoint,
	countyShapes,
	locationError,
	type CountyShape
} from './locate';

/** A lon/lat rectangle as a county. At 45°N, 0.01° of longitude is about 0.79 km. */
function box(fips: string, west: number, south: number, east: number, north: number): Feature {
	return {
		type: 'Feature',
		properties: { fips, name: `${fips} County`, state_name: 'Test' },
		geometry: {
			type: 'Polygon',
			coordinates: [
				[
					[west, south],
					[east, south],
					[east, north],
					[west, north],
					[west, south]
				]
			]
		}
	};
}

const SQUARES = countyShapes({
	type: 'FeatureCollection',
	features: [box('A', -90, 45, -89.5, 45.5), box('B', -89.5, 45, -89, 45.5)]
});

describe('checkLocation', () => {
	it('matches a point inside the chosen county', () => {
		const check = checkLocation(SQUARES, { lat: 45.2, lon: -89.8 }, 'A');
		expect(check).toMatchObject({ kind: 'match', km: 0 });
	});

	it('accepts a point within 2 km of the chosen county, where borders are approximate', () => {
		const check = checkLocation(SQUARES, { lat: 45.2, lon: -89.49 }, 'A');
		expect(check.kind).toBe('match');
		expect(check.kind === 'match' && check.km).toBeCloseTo(0.79, 1);
	});

	it('asks for confirmation 2–10 km out, saying where the point landed', () => {
		const check = checkLocation(SQUARES, { lat: 45.2, lon: -89.45 }, 'A');
		expect(check).toMatchObject({ kind: 'confirm', inside: { fips: 'B' } });
		expect(locationError(check, false)).toMatch(
			/^These coordinates are 3\.9 km outside A County, Test, in B County, Test\./
		);
		expect(locationError(check, true)).toBeNull();
	});

	it('refuses a point clearly in another county, naming it', () => {
		const check = checkLocation(SQUARES, { lat: 45.2, lon: -89.3 }, 'A');
		expect(check).toMatchObject({ kind: 'mismatch', inside: { fips: 'B' }, chosen: { fips: 'A' } });
		expect(locationError(check, true)).toBe(
			'These coordinates are in B County, Test, not A County, Test.'
		);
	});

	it('with no county chosen, finds the containing one, else the nearest within 10 km', () => {
		expect(checkLocation(SQUARES, { lat: 45.2, lon: -89.2 }, null)).toMatchObject({
			kind: 'unchosen',
			nearest: { shape: { fips: 'B' }, km: 0 }
		});
		const north = checkLocation(SQUARES, { lat: 45.545, lon: -89.8 }, null);
		expect(north.kind === 'unchosen' && north.nearest?.km).toBeCloseTo(4.98, 1);
		expect(checkLocation(SQUARES, { lat: 46, lon: -89.8 }, null)).toEqual({
			kind: 'unchosen',
			nearest: null
		});
	});
});

describe('against the map geometry', () => {
	const topo = JSON.parse(readFileSync('static/geo/counties.topo.json', 'utf8'));
	const shapes: CountyShape[] = countyShapes(
		feature(topo, topo.objects.counties) as unknown as FeatureCollection
	);
	const where = (lat: number, lon: number) => {
		const check = checkLocation(shapes, { lat, lon }, null);
		return check.kind === 'unchosen' && check.nearest?.km === 0 ? check.nearest.shape.fips : null;
	};

	it('finds US counties, Canadian divisions, and Virginia independent cities', () => {
		expect(where(43.0731, -89.4012)).toBe('55025'); // Madison: Dane County
		expect(where(45.4236, -75.7009)).toBe('C3506'); // Parliament Hill: Ottawa
		expect(where(45.5019, -73.5674)).toBe('C2466'); // Montréal
		expect(where(37.5407, -77.436)).toBe('51760'); // Richmond city, not a county
	});

	it('finds nothing in the middle of Lake Michigan', () => {
		expect(checkLocation(shapes, { lat: 43.5, lon: -87.0 }, null)).toEqual({
			kind: 'unchosen',
			nearest: null
		});
	});

	it('suggests the fix for a dropped minus sign or swapped order', () => {
		expect(correctedPoint(shapes, { lat: 43.0731, lon: 89.4012 })).toMatchObject({
			lat: 43.0731,
			lon: -89.4012,
			county: { fips: '55025' }
		});
		expect(correctedPoint(shapes, { lat: -89.4012, lon: 43.0731 })).toMatchObject({
			county: { fips: '55025' }
		});
		expect(correctedPoint(shapes, { lat: 43.5, lon: -87.0 })).toBeNull();
	});
});
