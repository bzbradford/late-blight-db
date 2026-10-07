/**
 * Coordinates as people paste them: "43.0731, -89.4012" (what Google Maps copies),
 * "43.0731 -89.4012", or with hemispheres, "43.0731° N, 89.4012° W". Decimal degrees
 * only; degrees-minutes-seconds is refused with a message saying so.
 */
export type Point = { lat: number; lon: number };

/** Five decimal places is about a metre: as precise as a field location needs. */
export const COORDINATE_DECIMALS = 5;

const PART = /^([+-]?\d+(?:\.\d+)?)\s*°?\s*([NSEW])?$/i;

function round(n: number): number {
	const f = 10 ** COORDINATE_DECIMALS;
	return Math.round(n * f) / f;
}

export function parseCoordinates(text: string): { point: Point } | { error: string } {
	const cleaned = text
		.trim()
		.replace(/^\(|\)$/g, '')
		.trim();
	if (/['"′″]/.test(cleaned)) {
		return { error: 'Enter decimal degrees, e.g. 43.0731, -89.4012 (not degrees and minutes).' };
	}
	const parts = cleaned.includes(',')
		? cleaned.split(',').map((p) => p.trim())
		: cleaned.split(/\s+(?=[+-]?\d)/);
	const parsed = parts.length === 2 ? parts.map((p) => PART.exec(p)) : [];
	if (parsed.length !== 2 || parsed.some((m) => !m)) {
		return { error: 'Enter latitude, longitude in decimal degrees, e.g. 43.0731, -89.4012.' };
	}

	const [a, b] = parsed as RegExpExecArray[];
	const value = (m: RegExpExecArray) => {
		const n = Number(m[1]);
		const hemi = m[2]?.toUpperCase();
		return hemi === 'S' || hemi === 'W' ? -Math.abs(n) : n;
	};
	// With hemisphere letters the order can be either way round: "89.4 W, 43.07 N".
	const aIsLon = /[EW]/i.test(a[2] ?? '') || /[NS]/i.test(b[2] ?? '');
	const lat = round(aIsLon ? value(b) : value(a));
	const lon = round(aIsLon ? value(a) : value(b));

	if (Math.abs(lat) > 90) return { error: 'Latitude must be between -90 and 90.' };
	if (Math.abs(lon) > 180) return { error: 'Longitude must be between -180 and 180.' };
	return { point: { lat, lon } };
}

/** "43.0731, -89.4012": how stored coordinates are shown and edited. */
export function formatCoordinates(point: Point): string {
	return `${point.lat}, ${point.lon}`;
}
