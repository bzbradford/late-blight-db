import { describe, expect, it } from 'vitest';
import { geometryBounds, unionBounds } from './bounds';

describe('geometryBounds', () => {
	it('covers every ring of a polygon, holes included', () => {
		expect(
			geometryBounds({
				type: 'Polygon',
				coordinates: [
					[
						[-90, 43],
						[-89, 43],
						[-89, 44],
						[-90, 44],
						[-90, 43]
					]
				]
			})
		).toEqual([-90, 43, -89, 44]);
	});

	it('covers every part of a multipolygon, e.g. a county with islands', () => {
		expect(
			geometryBounds({
				type: 'MultiPolygon',
				coordinates: [
					[
						[
							[-90, 43],
							[-89, 43],
							[-89, 44],
							[-90, 43]
						]
					],
					[
						[
							[-87, 45],
							[-86.5, 45],
							[-86.5, 45.5],
							[-87, 45]
						]
					]
				]
			})
		).toEqual([-90, 43, -86.5, 45.5]);
	});

	it('returns null for geometry with no area', () => {
		expect(geometryBounds({ type: 'Point', coordinates: [-89, 43] })).toBeNull();
		expect(geometryBounds({ type: 'Polygon', coordinates: [] })).toBeNull();
	});
});

describe('unionBounds', () => {
	it('returns null for nothing to frame', () => {
		expect(unionBounds([])).toBeNull();
	});

	it('returns a single box unchanged, without aliasing it', () => {
		const box: [number, number, number, number] = [-90, 43, -89, 44];
		const result = unionBounds([box]);
		expect(result).toEqual(box);
		expect(result).not.toBe(box);
	});

	it('spans boxes that do not overlap', () => {
		expect(
			unionBounds([
				[-90, 43, -89, 44],
				[-78, 35, -77, 36]
			])
		).toEqual([-90, 35, -77, 44]);
	});
});
