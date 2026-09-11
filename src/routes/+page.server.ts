import { getCountyAggregates, getDetections } from '$lib/server/queries/detections';
import { listDiseases, listYears } from '$lib/server/queries/diseases';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const diseases = await listDiseases();

	// Fall back rather than error: a stale or hand-edited link should still show
	// something sensible instead of a 404.
	const requested = url.searchParams.get('disease');
	const disease = diseases.find((d) => d.slug === requested) ?? diseases[0];

	const years = await listYears(disease.slug);
	const requestedYear = Number(url.searchParams.get('year'));
	const year = years.includes(requestedYear) ? requestedYear : years[0];

	const county = url.searchParams.get('county');

	const [aggregates, detections] = await Promise.all([
		getCountyAggregates(disease.slug, year),
		getDetections(disease.slug, year)
	]);

	return {
		activeDisease: disease.slug,
		activeYear: year,
		years,
		aggregates,
		detections,
		selectedCounty: county && /^\d{5}$/.test(county) ? county : null
	};
};
