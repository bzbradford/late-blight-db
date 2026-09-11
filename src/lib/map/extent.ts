/**
 * Default map extent, and the rule for widening it.
 *
 * The configured extent is a *minimum*, not a clamp. The map opens showing at least
 * this area, but if the selected disease-year has detections outside it the view
 * expands to include them — a detection must never sit silently off-screen because
 * the default view was framed more tightly than the data.
 *
 * This matters most for a regional default: with `upper-midwest` configured, a report
 * from Pennsylvania or Georgia still pulls the view out to include it.
 */
import { env } from '$env/dynamic/public';

/** `[west, south, east, north]` in degrees — the order MapLibre's LngLatBounds uses. */
export type Extent = [number, number, number, number];

export const EXTENTS = {
	/** Continental US. The default: national scope, no empty ocean. */
	conus: [-125.0, 24.0, -66.5, 49.5],
	/** MN/WI/MI/IA/IL/IN/OH, for a regional deployment. */
	'upper-midwest': [-97.5, 38.5, -80.5, 49.5]
} as const satisfies Record<string, Extent>;

export type ExtentName = keyof typeof EXTENTS;

export function isExtentName(value: string): value is ExtentName {
	return value in EXTENTS;
}

/**
 * Default view, overridable per deployment with `PUBLIC_MAP_DEFAULT_EXTENT`
 * (one of the keys above). Falls back to CONUS on an unrecognised value rather
 * than failing to render a map.
 */
export function defaultExtent(): Extent {
	const name = env.PUBLIC_MAP_DEFAULT_EXTENT ?? '';
	return [...(isExtentName(name) ? EXTENTS[name] : EXTENTS.conus)] as Extent;
}

export type Located = { lon: number; lat: number };

/**
 * Widens `base` so every point falls inside it, with a margin so markers near an edge
 * are not flush against the viewport. Returns `base` unchanged when nothing lies
 * outside — the common case, and the one where the view must stay stable.
 *
 * `padding` is in degrees and only applied to edges that actually moved, so the
 * default framing never drifts.
 */
export function expandExtent(base: Extent, points: Located[], padding = 1.5): Extent {
	let [west, south, east, north] = base;

	for (const { lon, lat } of points) {
		if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
		if (lon < west) west = lon - padding;
		if (lon > east) east = lon + padding;
		if (lat < south) south = lat - padding;
		if (lat > north) north = lat + padding;
	}

	return [Math.max(west, -180), Math.max(south, -85), Math.min(east, 180), Math.min(north, 85)];
}
