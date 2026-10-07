/**
 * County keys: a US county's 5-digit FIPS ("55025"), or a Canadian census division's
 * CDUID behind a `C` ("C3506", Ottawa). The prefix keeps the two apart — a bare CDUID is
 * four digits, which is exactly what a FIPS code looks like after Excel drops its leading
 * zero. See `scripts/build-geo.ts`.
 */
export const COUNTY_KEY = /^(\d{5}|C\d{4})$/;

export function isCountyKey(value: string): boolean {
	return COUNTY_KEY.test(value);
}

/**
 * A county key as people type it or a spreadsheet saves it: trimmed, the prefix
 * upper-cased ("c3506"), and the leading zero Excel strips from a FIPS restored
 * ("1001" → "01001"). Anything else comes back unchanged, for the caller to reject.
 */
export function normalizeCountyKey(raw: string): string {
	const key = raw.trim().toUpperCase();
	return /^\d{4}$/.test(key) ? `0${key}` : key;
}
