/**
 * Which county a point falls in, from the map's own county geometry.
 *
 * Pure, and shared by the detection form (which checks as you type) and the server
 * (which checks again on save), so both reach the same answer from the same polygons.
 * There is still no spatial database: the polygons are the static TopoJSON the map
 * draws (see CLAUDE.md).
 *
 * That geometry is simplified for drawing, so its borders sit a few hundred metres from
 * the real ones and occasionally a few kilometres. A point near a border can fall just
 * inside the neighbouring county's polygon when it is really in its own; `checkLocation`
 * allows for that rather than treating the polygons as exact.
 */
import type { FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';

export type Bbox = [west: number, south: number, east: number, north: number];

export type CountyShape = {
	fips: string;
	/** Full name and state, as the map's tooltip shows them: "Dane County", "Wisconsin". */
	name: string;
	stateName: string;
	bbox: Bbox;
	/** Polygons, each an outer ring then its holes. */
	polygons: Position[][][];
};

export type CountyProperties = { fips: string; name: string; state_name: string };

export function countyShapes(collection: FeatureCollection): CountyShape[] {
	const shapes: CountyShape[] = [];
	for (const f of collection.features) {
		const geometry = f.geometry as Polygon | MultiPolygon | null;
		if (!geometry) continue;
		const props = f.properties as CountyProperties;
		const polygons =
			geometry.type === 'Polygon' ? [geometry.coordinates] : (geometry.coordinates ?? []);
		shapes.push({
			fips: props.fips,
			name: props.name,
			stateName: props.state_name,
			bbox: bboxOf(polygons),
			polygons
		});
	}
	return shapes;
}

function bboxOf(polygons: Position[][][]): Bbox {
	let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
	for (const polygon of polygons) {
		for (const [x, y] of polygon[0]) {
			if (x < w) w = x;
			if (x > e) e = x;
			if (y < s) s = y;
			if (y > n) n = y;
		}
	}
	return [w, s, e, n];
}

/** Even-odd ray casting: inside the outer ring and outside every hole. */
function inPolygon(lon: number, lat: number, polygon: Position[][]): boolean {
	let inside = false;
	for (const ring of polygon) {
		for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
			const [xi, yi] = ring[i];
			const [xj, yj] = ring[j];
			if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
				inside = !inside;
			}
		}
	}
	return inside;
}

export function contains(shape: CountyShape, lon: number, lat: number): boolean {
	const [w, s, e, n] = shape.bbox;
	if (lon < w || lon > e || lat < s || lat > n) return false;
	return shape.polygons.some((p) => inPolygon(lon, lat, p));
}

const KM_PER_DEGREE_LAT = 110.57;
const KM_PER_DEGREE_LON_AT_EQUATOR = 111.32;

/**
 * Kilometres from the point to the county's boundary, or 0 inside it. A flat projection
 * around the point: accurate to well under 1% over the tens of kilometres this is used for.
 */
export function distanceKm(shape: CountyShape, lon: number, lat: number): number {
	if (contains(shape, lon, lat)) return 0;
	const kx = KM_PER_DEGREE_LON_AT_EQUATOR * Math.cos((lat * Math.PI) / 180);
	const ky = KM_PER_DEGREE_LAT;
	let best = Infinity;
	for (const polygon of shape.polygons) {
		for (const ring of polygon) {
			for (let i = 1; i < ring.length; i++) {
				const ax = (ring[i - 1][0] - lon) * kx;
				const ay = (ring[i - 1][1] - lat) * ky;
				const bx = (ring[i][0] - lon) * kx;
				const by = (ring[i][1] - lat) * ky;
				const dx = bx - ax;
				const dy = by - ay;
				const len2 = dx * dx + dy * dy;
				const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
				const d = Math.hypot(ax + t * dx, ay + t * dy);
				if (d < best) best = d;
			}
		}
	}
	return best;
}

/** Degrees that cover at least `km` in every direction at this latitude. */
function degreesFor(km: number, lat: number) {
	const cos = Math.max(Math.cos((lat * Math.PI) / 180), 0.1);
	return { dLon: km / (KM_PER_DEGREE_LON_AT_EQUATOR * cos), dLat: km / KM_PER_DEGREE_LAT };
}

export type Nearby = { shape: CountyShape; km: number };

/** Counties within `radiusKm` of the point, nearest first; one containing it has `km: 0`. */
export function countiesNear(
	shapes: CountyShape[],
	lon: number,
	lat: number,
	radiusKm: number
): Nearby[] {
	const { dLon, dLat } = degreesFor(radiusKm, lat);
	const found: Nearby[] = [];
	for (const shape of shapes) {
		const [w, s, e, n] = shape.bbox;
		if (lon < w - dLon || lon > e + dLon || lat < s - dLat || lat > n + dLat) continue;
		const km = distanceKm(shape, lon, lat);
		if (km <= radiusKm) found.push({ shape, km });
	}
	return found.sort((a, b) => a.km - b.km);
}

/**
 * Within this distance of the chosen county, coordinates are accepted as they are: the
 * simplified borders put 99% of points that land outside their own county within 2 km of
 * it (measured on 135,000 random points against the full-detail census boundaries).
 */
export const TOLERANCE_KM = 2;

/**
 * Between `TOLERANCE_KM` and this, saving needs an explicit "use anyway". In the same
 * measurement every point further out than 2 km was on a coastal island or shoreline the
 * simplification removed (the worst, 8.9 km, in Island County, WA); beyond 10 km none.
 */
export const CONFIRM_KM = 10;

export type LocationCheck =
	/** Inside the chosen county, or within `TOLERANCE_KM` of it. */
	| { kind: 'match'; county: CountyShape; km: number }
	/** `TOLERANCE_KM`–`CONFIRM_KM` outside the chosen county; `inside` is where it landed. */
	| { kind: 'confirm'; county: CountyShape; km: number; inside: CountyShape | null }
	/** Further from the chosen county than `CONFIRM_KM`. */
	| {
			kind: 'mismatch';
			chosen: CountyShape | null;
			inside: CountyShape | null;
			nearest: Nearby | null;
	  }
	/** No county chosen yet: the one to choose, if any is within `CONFIRM_KM`. */
	| { kind: 'unchosen'; nearest: Nearby | null };

export function checkLocation(
	shapes: CountyShape[],
	point: { lat: number; lon: number },
	chosenFips: string | null
): LocationCheck {
	const near = countiesNear(shapes, point.lon, point.lat, CONFIRM_KM);
	const inside = near[0]?.km === 0 ? near[0].shape : null;
	if (!chosenFips) return { kind: 'unchosen', nearest: near[0] ?? null };

	const chosen = near.find((n) => n.shape.fips === chosenFips);
	if (!chosen) {
		const shape = shapes.find((s) => s.fips === chosenFips) ?? null;
		return { kind: 'mismatch', chosen: shape, inside, nearest: near[0] ?? null };
	}
	if (chosen.km <= TOLERANCE_KM) return { kind: 'match', county: chosen.shape, km: chosen.km };
	return { kind: 'confirm', county: chosen.shape, km: chosen.km, inside };
}

/**
 * The usual slips when coordinates land in no county: the minus sign left off a
 * longitude (which puts a Wisconsin farm in China), or latitude and longitude swapped.
 * Returns the first correction that lands in a county, with that county.
 */
export function correctedPoint(
	shapes: CountyShape[],
	point: { lat: number; lon: number }
): { lat: number; lon: number; county: CountyShape } | null {
	const candidates = [
		{ lat: point.lat, lon: -point.lon },
		{ lat: point.lon, lon: point.lat },
		{ lat: point.lon, lon: -point.lat }
	];
	for (const c of candidates) {
		if (Math.abs(c.lat) > 90 || Math.abs(c.lon) > 180) continue;
		const county = shapes.find((s) => contains(s, c.lon, c.lat));
		if (county) return { ...c, county };
	}
	return null;
}

/** "Dane County, Wisconsin" */
export function shapeLabel(shape: CountyShape): string {
	return `${shape.name}, ${shape.stateName}`;
}

function km(n: number): string {
	return `${n < 10 ? n.toFixed(1) : Math.round(n)} km`;
}

/**
 * Why coordinates can't be saved with the chosen county, or null if they can. The form
 * shows the same verdict with buttons to fix it; this is the server's and the importer's
 * wording. `confirmed` is the "use anyway" for the `confirm` band.
 */
export function locationError(check: LocationCheck, confirmed: boolean): string | null {
	switch (check.kind) {
		case 'match':
		case 'unchosen':
			return null;
		case 'confirm':
			if (confirmed) return null;
			return (
				`These coordinates are ${km(check.km)} outside ${shapeLabel(check.county)}` +
				`${check.inside ? `, in ${shapeLabel(check.inside)}` : ''}. ` +
				"Near coasts the map's simplified borders can do this: confirm them if they are right."
			);
		case 'mismatch': {
			const chosen = check.chosen ? `, not ${shapeLabel(check.chosen)}` : '';
			if (check.inside) return `These coordinates are in ${shapeLabel(check.inside)}${chosen}.`;
			if (check.nearest) {
				return `These coordinates are ${km(check.nearest.km)} from ${shapeLabel(check.nearest.shape)}${chosen}.`;
			}
			return 'These coordinates are not in any county on this map.';
		}
	}
}
