import { describe, expect, it } from 'vitest';
import { EXTENTS, expandExtent, isExtentName, type Extent } from './extent';

const CONUS: Extent = [...EXTENTS.conus];

// Interior points from the seeded county table. Scope is CONUS, so the interesting
// outliers are relative to a *regional* default extent, not a national one.
const MIDWEST: Extent = [...EXTENTS['upper-midwest']];
const DANE_WI = { lon: -89.41814, lat: 43.06731 }; // inside both extents
const CENTRE_PA = { lon: -77.82, lat: 40.92 }; // east of the upper-midwest extent
const COLQUITT_GA = { lon: -83.76, lat: 31.19 }; // south-east of it
const YAKIMA_WA = { lon: -120.75, lat: 46.46 }; // west of it

describe('isExtentName', () => {
	it('accepts configured names and rejects others', () => {
		expect(isExtentName('conus')).toBe(true);
		expect(isExtentName('upper-midwest')).toBe(true);
		expect(isExtentName('atlantis')).toBe(false);
	});
});

describe('expandExtent', () => {
	it('leaves the extent untouched when every point is already inside', () => {
		expect(expandExtent(CONUS, [DANE_WI])).toEqual(CONUS);
	});

	it('is unchanged with no points at all', () => {
		expect(expandExtent(CONUS, [])).toEqual(CONUS);
	});

	it('widens east for a Pennsylvania detection under a regional default', () => {
		const [west, south, east, north] = expandExtent(MIDWEST, [CENTRE_PA]);
		expect(east).toBeGreaterThan(CENTRE_PA.lon);
		expect(west).toBe(MIDWEST[0]);
		expect(south).toBe(MIDWEST[1]);
		expect(north).toBe(MIDWEST[3]);
	});

	it('widens south for a Georgia detection under a regional default', () => {
		const [, south] = expandExtent(MIDWEST, [COLQUITT_GA]);
		expect(south).toBeLessThan(COLQUITT_GA.lat);
	});

	it('widens west for a Washington detection under a regional default', () => {
		const [west] = expandExtent(MIDWEST, [YAKIMA_WA]);
		expect(west).toBeLessThan(YAKIMA_WA.lon);
	});

	it('leaves a CONUS default alone for any US detection', () => {
		expect(expandExtent(CONUS, [DANE_WI, CENTRE_PA, COLQUITT_GA, YAKIMA_WA])).toEqual(CONUS);
	});

	it('widens a CONUS default north and east for Canadian detections', () => {
		const edmonton = { lon: -113.5, lat: 53.5 };
		const stJohns = { lon: -52.9, lat: 47.4 };
		expect(expandExtent(CONUS, [edmonton, stJohns])).toEqual([-125.0, 24.0, -51.4, 55.0]);
	});

	it('leaves a us-canada default alone for detections in southern Canada', () => {
		const US_CANADA: Extent = [...EXTENTS['us-canada']];
		expect(expandExtent(US_CANADA, [{ lon: -113.5, lat: 53.5 }, DANE_WI])).toEqual(US_CANADA);
	});

	it('only pads edges that actually moved', () => {
		// Colquitt GA lies south of the extent but within it longitudinally, so only
		// the south edge may move. Dane WI is inside on every axis.
		const out = expandExtent(MIDWEST, [COLQUITT_GA, DANE_WI], 2);
		expect(out[1]).toBeCloseTo(COLQUITT_GA.lat - 2, 5);
		// Untouched edges keep their exact configured values — the default framing
		// must not drift just because a point fell outside on a different axis.
		expect(out[0]).toBe(MIDWEST[0]);
		expect(out[2]).toBe(MIDWEST[2]);
		expect(out[3]).toBe(MIDWEST[3]);
	});

	it('accommodates several outlying points at once', () => {
		const [west, south, east] = expandExtent(MIDWEST, [YAKIMA_WA, COLQUITT_GA, CENTRE_PA]);
		expect(west).toBeLessThan(YAKIMA_WA.lon);
		expect(south).toBeLessThan(COLQUITT_GA.lat);
		expect(east).toBeGreaterThan(CENTRE_PA.lon);
	});

	it('never exceeds valid geographic bounds', () => {
		const out = expandExtent(CONUS, [{ lon: -179.9, lat: 84.9 }], 10);
		expect(out[0]).toBeGreaterThanOrEqual(-180);
		expect(out[3]).toBeLessThanOrEqual(85);
	});

	it('ignores non-finite coordinates rather than producing NaN bounds', () => {
		const out = expandExtent(CONUS, [{ lon: Number.NaN, lat: 43 }]);
		expect(out.every(Number.isFinite)).toBe(true);
		expect(out).toEqual(CONUS);
	});

	it('does not mutate the extent it was given', () => {
		const base: Extent = [...EXTENTS['upper-midwest']];
		expandExtent(base, [COLQUITT_GA]);
		expect(base).toEqual(EXTENTS['upper-midwest']);
	});
});
