import { describe, expect, it } from 'vitest';
import { formatCoordinates, parseCoordinates } from './coordinates';

const point = (text: string) => {
	const r = parseCoordinates(text);
	return 'point' in r ? r.point : r.error;
};

describe('parseCoordinates', () => {
	it('reads what Google Maps copies, and other spacings', () => {
		for (const text of [
			'43.0731, -89.4012',
			'43.0731,-89.4012',
			'43.0731 -89.4012',
			'(43.0731, -89.4012)'
		]) {
			expect(point(text), text).toEqual({ lat: 43.0731, lon: -89.4012 });
		}
	});

	it('reads hemisphere letters, in either order', () => {
		expect(point('43.0731° N, 89.4012° W')).toEqual({ lat: 43.0731, lon: -89.4012 });
		expect(point('43.0731N 89.4012W')).toEqual({ lat: 43.0731, lon: -89.4012 });
		expect(point('89.4012 W, 43.0731 N')).toEqual({ lat: 43.0731, lon: -89.4012 });
	});

	it('keeps five decimal places, about a metre', () => {
		expect(point('43.07310049, -89.401249999')).toEqual({ lat: 43.0731, lon: -89.40125 });
	});

	it('refuses anything else with a message', () => {
		expect(point('Madison')).toMatch(/decimal degrees/);
		expect(point('43.0731')).toMatch(/decimal degrees/);
		expect(point(`43°04'23" N, 89°24'04" W`)).toMatch(/not degrees and minutes/);
		expect(point('93.1, -89.4')).toMatch(/Latitude/);
		expect(point('43.1, -189.4')).toMatch(/Longitude/);
	});

	it('round-trips through formatCoordinates', () => {
		expect(point(formatCoordinates({ lat: 45.42153, lon: -75.69719 }))).toEqual({
			lat: 45.42153,
			lon: -75.69719
		});
	});
});
