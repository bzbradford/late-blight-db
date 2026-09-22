/**
 * Basemap configuration — the only place a tile source is named.
 *
 * Defaults to OpenFreeMap's Positron style (light) and Dark style (dark): MapLibre-native
 * vector tiles with no API key, no signup, and no per-view billing. An institutional
 * deployment should not depend on a third-party key that somebody has to remember to
 * renew.
 *
 * Swapping to MapTiler/Stadia, or to a self-hosted Protomaps `.pmtiles` extract served
 * off the extension server, is a change to `PUBLIC_BASEMAP_STYLE_URL` (and optionally
 * `PUBLIC_BASEMAP_STYLE_URL_DARK`) and nothing else.
 *
 * The basemap is geographic *context only*. Counties and state outlines carry all the
 * information, so the map must render correctly when this is unset or the host is
 * unreachable — see `fallbackStyle()`.
 */
import { env } from '$env/dynamic/public';
import type { StyleSpecification } from 'maplibre-gl';
import { resolveToken } from '$lib/map/symbology';
import type { Theme } from '$lib/state/theme.svelte';

export const DEFAULT_BASEMAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';
export const DEFAULT_BASEMAP_STYLE_DARK = 'https://tiles.openfreemap.org/styles/dark';

/**
 * The style URL for a theme, or null for "no basemap".
 *
 * When a deployment points the light style somewhere custom but sets no dark one, dark
 * mode reuses the light style rather than quietly falling back to OpenFreeMap — a
 * deployment that moved off a tile host must not keep calling it from dark mode.
 */
export function basemapStyleUrl(theme: Theme = 'light'): string | null {
	const light = env.PUBLIC_BASEMAP_STYLE_URL?.trim();
	// An explicitly empty value is a deliberate "no basemap", not a misconfiguration.
	if (light === '') return null;
	if (theme === 'light') return light ?? DEFAULT_BASEMAP_STYLE;

	const dark = env.PUBLIC_BASEMAP_STYLE_URL_DARK?.trim();
	if (dark) return dark;
	// Spelling out the default light URL (as `.env.example` does) still counts as default.
	return !light || light === DEFAULT_BASEMAP_STYLE ? DEFAULT_BASEMAP_STYLE_DARK : light;
}

/**
 * A minimal valid style used when no basemap is configured, and as the recovery style
 * if the configured one fails to load. It has no sources — the county and state layers
 * are added on top of it exactly as they would be over real tiles.
 *
 * Call it after the theme class is applied: the background is resolved from the current
 * theme's tokens, and like every colour handed to MapLibre it must go through
 * `resolveToken()` — MapLibre cannot parse the `oklch()` the palette is written in.
 */
export function fallbackStyle(): StyleSpecification {
	return {
		version: 8,
		sources: {},
		layers: [
			{
				id: 'background',
				type: 'background',
				paint: { 'background-color': resolveToken('--map-background') }
			}
		],
		glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf'
	};
}
