import type { Geometry, Position } from 'geojson';
import type { Extent } from '$lib/map/extent';

/**
 * Bounding box of a county polygon, as `[west, south, east, north]`.
 *
 * "Zoom to detections" frames these rather than the counties' interior points: a
 * point-framed single county would put its edges off-screen, and several points hug
 * the viewport edge with half of each county cut off.
 */
export function geometryBounds(geometry: Geometry): Extent | null {
	let west = Infinity;
	let south = Infinity;
	let east = -Infinity;
	let north = -Infinity;

	const visit = (p: Position) => {
		if (p[0] < west) west = p[0];
		if (p[0] > east) east = p[0];
		if (p[1] < south) south = p[1];
		if (p[1] > north) north = p[1];
	};

	switch (geometry.type) {
		case 'Polygon':
			geometry.coordinates.forEach((ring) => ring.forEach(visit));
			break;
		case 'MultiPolygon':
			geometry.coordinates.forEach((poly) => poly.forEach((ring) => ring.forEach(visit)));
			break;
		default:
			// Counties are always areal; anything else carries no extent worth framing.
			return null;
	}

	return Number.isFinite(west) ? [west, south, east, north] : null;
}

/** The smallest extent containing every box, or null for none. */
export function unionBounds(boxes: Extent[]): Extent | null {
	if (boxes.length === 0) return null;
	return boxes.reduce<Extent>(
		([w, s, e, n], [bw, bs, be, bn]) => [
			Math.min(w, bw),
			Math.min(s, bs),
			Math.max(e, be),
			Math.max(n, bn)
		],
		[...boxes[0]]
	);
}
