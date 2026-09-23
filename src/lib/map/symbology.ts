/**
 * Choropleth binning, shared by the map layer and the legend so the two cannot drift.
 *
 * The mode depends on which year is being viewed:
 *
 *   current year → `recency`, binned on days since the most recent detection. This is
 *     the question a grower is actually asking mid-season: how fresh is this?
 *
 *   past year → `timing`, binned on the month of the *first* detection. A recency ramp
 *     on a finished season is meaningless — every detection is equally old — whereas
 *     when the disease arrived is genuinely useful.
 *
 * Colours are CSS custom properties defined in `src/routes/layout.css`. Nothing here
 * hardcodes a colour value.
 */

export type SymbologyMode = 'recency' | 'timing';

/** Per-county rollup for one disease-year. Dates are ISO `YYYY-MM-DD`. */
export type CountyAggregate = {
	fips: string;
	firstDetection: string;
	lastDetection: string;
	count: number;
};

export type LegendEntry = {
	/** CSS custom property name, e.g. `--recency-7`. */
	token: string;
	label: string;
};

export function symbologyMode(year: number, today = new Date()): SymbologyMode {
	return year === today.getFullYear() ? 'recency' : 'timing';
}

/** Whole days between two dates, ignoring time of day. */
export function daysBetween(from: string, to: Date): number {
	const a = Date.UTC(
		Number(from.slice(0, 4)),
		Number(from.slice(5, 7)) - 1,
		Number(from.slice(8, 10))
	);
	const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
	return Math.floor((b - a) / 86_400_000);
}

const RECENCY_LEGEND: LegendEntry[] = [
	{ token: '--recency-7', label: 'Within 7 days' },
	{ token: '--recency-14', label: '8–14 days' },
	{ token: '--recency-30', label: '15–30 days' },
	{ token: '--recency-old', label: 'More than 30 days' }
];

/**
 * Month bins for the timing ramp. Detections before May or after October are folded
 * into the end bins rather than given their own colours — outside that window the
 * counts are too sparse for a distinct band to mean anything.
 */
const TIMING_BINS = [
	{ month: 5, token: '--timing-1', label: 'May or earlier' },
	{ month: 6, token: '--timing-2', label: 'June' },
	{ month: 7, token: '--timing-3', label: 'July' },
	{ month: 8, token: '--timing-4', label: 'August' },
	{ month: 9, token: '--timing-5', label: 'September' },
	{ month: 10, token: '--timing-6', label: 'October or later' }
];

const TIMING_LEGEND: LegendEntry[] = TIMING_BINS.map(({ token, label }) => ({ token, label }));

/** The legend's heading — shared by the on-screen legend and the saved image. */
export function legendCaption(mode: SymbologyMode, year: number): string {
	return mode === 'recency'
		? 'Time since most recent detection'
		: `First detection during the ${year} season`;
}

/** The legend's last row, for counties with no detections. */
export const NO_DETECTIONS_LABEL = 'No detections reported';

export function legendFor(mode: SymbologyMode): LegendEntry[] {
	return mode === 'recency' ? RECENCY_LEGEND : TIMING_LEGEND;
}

/** The CSS custom property a county should be filled with, or null if it has no detections. */
export function tokenFor(
	aggregate: CountyAggregate | undefined,
	mode: SymbologyMode,
	today = new Date()
): string | null {
	if (!aggregate) return null;

	if (mode === 'recency') {
		const days = daysBetween(aggregate.lastDetection, today);
		if (days <= 7) return '--recency-7';
		if (days <= 14) return '--recency-14';
		if (days <= 30) return '--recency-30';
		return '--recency-old';
	}

	const month = Number(aggregate.firstDetection.slice(5, 7));
	if (month <= 5) return TIMING_BINS[0].token;
	if (month >= 10) return TIMING_BINS[TIMING_BINS.length - 1].token;
	return TIMING_BINS[month - 5].token;
}

const colorCache = new Map<string, string>();

/**
 * Resolves a CSS custom property to an `rgb()` string MapLibre can parse.
 *
 * Two conversions are needed, not one. MapLibre cannot read CSS variables, and it also
 * cannot parse `oklch()` — which the palette is authored in. Worse, an unparseable
 * colour does not throw: `addLayer` reports it through the map's `error` event and
 * silently skips the layer, so the map renders a basemap with no data on it.
 *
 * Rasterising a 1×1 canvas hands the conversion to the browser's own colour management
 * rather than reimplementing OKLCH→sRGB here, and works for any colour syntax the
 * browser supports.
 */
export function resolveToken(token: string, el: Element = document.documentElement): string {
	const cached = colorCache.get(token);
	if (cached) return cached;

	const raw = getComputedStyle(el).getPropertyValue(token).trim();
	if (!raw) return 'rgb(0, 0, 0)';

	const ctx = document.createElement('canvas').getContext('2d');
	if (!ctx) return raw;

	ctx.fillStyle = raw;
	ctx.fillRect(0, 0, 1, 1);
	const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
	const resolved = a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a / 255})`;

	colorCache.set(token, resolved);
	return resolved;
}

/** Clears memoised colours — call when the theme changes. */
export function clearColorCache() {
	colorCache.clear();
}
