/**
 * The map's county geometry, for checking coordinates on the server.
 *
 * Bundled as text rather than read from `static/` at runtime: on Vercel the static files
 * are not on the function's filesystem. Parsed once per process on first use; it never
 * changes between requests, so sharing it across them is safe.
 */
import type { FeatureCollection } from 'geojson';
import { feature } from 'topojson-client';
import { checkLocation, countyShapes, locationError, type CountyShape } from '$lib/geo/locate';
import type { IncidentInput } from '$lib/validation/incident';
import raw from '../../../static/geo/counties.topo.json?raw';

let shapes: CountyShape[] | undefined;

export function serverCountyShapes(): CountyShape[] {
	if (!shapes) {
		const topo = JSON.parse(raw) as Parameters<typeof feature>[0];
		shapes = countyShapes(feature(topo, topo.objects.counties) as unknown as FeatureCollection);
	}
	return shapes;
}

/**
 * Why a detection's coordinates can't be saved with its county, or null. `confirmed` is
 * the form's "use anyway" for a point a few kilometres outside the county.
 */
export function locationProblem(values: IncidentInput, confirmed: boolean): string | null {
	if (!values.location) return null;
	const check = checkLocation(serverCountyShapes(), values.location, values.countyFips);
	return locationError(check, confirmed);
}
