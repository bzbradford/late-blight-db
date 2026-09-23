/**
 * Text for the county hover tooltip. Kept apart from the map component so the wording
 * can be tested without a WebGL context.
 */
export type TooltipCounty = { name: string; stateName: string };

export type TooltipDetection = {
	observedOn: string;
	crop: string | null;
	strain: string | null;
};

export type TooltipContent = { title: string; lines: string[] };

/** `2026-09-19` → `Sep 19, 2026`, read as a calendar date with no timezone shift. */
export function formatShortDate(iso: string, locale?: string): string {
	const [y, m, d] = iso.split('-').map(Number);
	return new Date(y, m - 1, d).toLocaleDateString(locale, {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});
}

/** `2026-09-19` → `Sep 19`. Labels sit under a title that already names the year. */
export function formatMonthDay(iso: string, locale?: string): string {
	const [y, m, d] = iso.split('-').map(Number);
	return new Date(y, m - 1, d).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

/**
 * @param count   detections in this county for the disease-year; 0 for none
 * @param latest  the county's most recent detection, when it has any
 */
export function tooltipContent(
	county: TooltipCounty,
	year: number,
	count: number,
	latest: TooltipDetection | undefined,
	locale?: string
): TooltipContent {
	const title = county.stateName ? `${county.name}, ${county.stateName}` : county.name;

	if (count === 0 || !latest) return { title, lines: [`No detections in ${year}`] };

	const lines = [
		`${count} ${count === 1 ? 'detection' : 'detections'} in ${year}`,
		`Most recent: ${formatShortDate(latest.observedOn, locale)}`
	];
	// Omitted rather than shown as "—": an absent crop or strain is common and says nothing.
	const detail = [latest.crop, latest.strain].filter(Boolean).join(' · ');
	if (detail) lines.push(detail);

	return { title, lines };
}
