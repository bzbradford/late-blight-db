/**
 * Basemap configuration — the only place a tile source is named.
 *
 * Defaults to OpenFreeMap's Positron style: MapLibre-native vector tiles with no API
 * key, no signup, and no per-view billing. An institutional deployment should not
 * depend on a third-party key that somebody has to remember to renew.
 *
 * Swapping to MapTiler/Stadia, or to a self-hosted Protomaps `.pmtiles` extract served
 * off the extension server, is a change to `PUBLIC_BASEMAP_STYLE_URL` and nothing else.
 *
 * The basemap is geographic *context only*. Counties and state outlines carry all the
 * information, so the map must render correctly when this is unset or the host is
 * unreachable — see `fallbackStyle()`.
 */
import { env } from '$env/dynamic/public';
import type { StyleSpecification } from 'maplibre-gl';

export const DEFAULT_BASEMAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';

export function basemapStyleUrl(): string | null {
	const url = env.PUBLIC_BASEMAP_STYLE_URL?.trim();
	if (url === undefined) return DEFAULT_BASEMAP_STYLE;
	// An explicitly empty value is a deliberate "no basemap", not a misconfiguration.
	return url === '' ? null : url;
}

/**
 * A minimal valid style used when no basemap is configured, and as the recovery style
 * if the configured one fails to load. It has no sources — the county and state layers
 * are added on top of it exactly as they would be over real tiles.
 */
export function fallbackStyle(): StyleSpecification {
	return {
		version: 8,
		sources: {},
		layers: [
			{
				id: 'background',
				type: 'background',
				paint: { 'background-color': 'oklch(0.97 0.002 250)' }
			}
		],
		glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf'
	};
}
