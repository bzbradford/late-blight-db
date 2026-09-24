import {
	getCountyAggregates,
	getDetections,
	type CountyAggregateRow,
	type Detection
} from '$lib/server/queries/detections';
import { listYears, type Disease } from '$lib/server/queries/diseases';
import type { Viewer } from '$lib/auth/roles';

/** Everything the public map needs for one disease-year. */
export type ViewData = {
	activeDisease: string;
	activeYear: number;
	years: number[];
	aggregates: CountyAggregateRow[];
	detections: Detection[];
};

/**
 * Resolves a requested disease-year to the data behind it.
 *
 * Shared by the page `load` (arrival, including from a share link) and `/api/view`
 * (every later switch), so both apply the same fallbacks. Fall back rather than error:
 * a stale or hand-edited link should still show something sensible instead of a 404.
 */
export async function loadView(
	diseases: Disease[],
	requestedDisease: string | null,
	requestedYear: number,
	/** The signed-in user, if any — only decides each detection's `canEdit`. */
	viewer: Viewer | null
): Promise<ViewData> {
	const disease = diseases.find((d) => d.slug === requestedDisease) ?? diseases[0];

	const years = await listYears(disease.slug);
	const year = years.includes(requestedYear) ? requestedYear : years[0];

	const [aggregates, detections] = await Promise.all([
		getCountyAggregates(disease.slug, year),
		getDetections(disease.slug, year, viewer)
	]);

	return { activeDisease: disease.slug, activeYear: year, years, aggregates, detections };
}
