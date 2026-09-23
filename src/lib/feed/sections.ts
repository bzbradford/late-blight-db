import { binToken, legendFor, type SymbologyMode } from '$lib/map/symbology';

export type FeedSection<T> = {
	/** The legend entry's CSS custom property, shown as the heading's swatch. */
	token: string;
	label: string;
	items: T[];
};

/**
 * Groups detections under the legend entries shown beside the map, newest section first.
 * Every entry gets a section, even an empty one, so the feed says outright that nothing
 * was reported in a window rather than leaving the reader to notice a gap.
 *
 * Items keep their input order within a section; the feed passes them newest first.
 */
export function feedSections<T extends { observedOn: string }>(
	detections: T[],
	mode: SymbologyMode,
	today = new Date()
): FeedSection<T>[] {
	const legend = legendFor(mode);
	// The recency legend already runs newest to oldest; the timing legend runs by month.
	const ordered = mode === 'recency' ? legend : [...legend].reverse();
	const sections = ordered.map(({ token, label }) => ({ token, label, items: [] as T[] }));
	for (const d of detections) {
		const token = binToken(d.observedOn, mode, today);
		sections.find((s) => s.token === token)?.items.push(d);
	}
	return sections;
}
