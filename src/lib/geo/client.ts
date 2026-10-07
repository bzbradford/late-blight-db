/**
 * The county geometry in the browser, for checking coordinates as they're typed. The map
 * loads the same file, so it's usually already cached. Fetched on first use only: most
 * detections are entered without coordinates.
 */
import type { FeatureCollection } from 'geojson';
import { feature } from 'topojson-client';
import { countyShapes, type CountyShape } from './locate';

let loading: Promise<CountyShape[]> | undefined;

export function loadCountyShapes(): Promise<CountyShape[]> {
	loading ??= fetch('/geo/counties.topo.json')
		.then((res) => {
			if (!res.ok) throw new Error(`Failed to load county geometry: ${res.status}`);
			return res.json();
		})
		.then((topo) =>
			countyShapes(feature(topo, topo.objects.counties) as unknown as FeatureCollection)
		)
		.catch((err: unknown) => {
			// Let a later attempt retry; the server checks on save either way.
			loading = undefined;
			throw err;
		});
	return loading;
}
