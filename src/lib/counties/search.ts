import { isCountyKey, normalizeCountyKey } from '$lib/counties/key';
import type { CountyOption } from '$lib/server/queries/admin';

/** How many matches the county picker lists at once; typing more narrows it. */
export const MAX_MATCHES = 50;

/** Words people type that county names in the table do not carry (it holds Census NAME). */
const IGNORED = new Set(['county', 'parish', 'borough', 'co']);

function normalize(text: string): string {
	return text
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[.'’]/g, '')
		.replace(/\bst\b/g, 'saint')
		.replace(/\bste\b/g, 'sainte');
}

function words(text: string): string[] {
	return normalize(text)
		.split(/[\s,-]+/)
		.filter((w) => w && !IGNORED.has(w));
}

/** The label a chosen county shows in the input: "Dane, WI". */
export function countyLabel(county: CountyOption): string {
	return `${county.name}, ${county.stateUsps}`;
}

/**
 * Counties matching what was typed. Every typed word must begin a word of the county
 * name, the state name, or the state abbreviation, so "dane", "dane wi", "Dane County,
 * Wisconsin", and "st louis mo" all work. A county key ("55025", "C3506") matches exactly.
 *
 * Counties whose name starts with the first word rank first; otherwise alphabetical.
 */
export function searchCounties(
	counties: CountyOption[],
	query: string,
	limit = MAX_MATCHES
): CountyOption[] {
	const trimmed = query.trim();
	const key = normalizeCountyKey(trimmed);
	if (isCountyKey(key) && !/^\d{4}$/.test(trimmed)) {
		return counties.filter((c) => c.fips === key);
	}

	const typed = words(trimmed);
	if (typed.length === 0) return [];

	const scored: { county: CountyOption; rank: number }[] = [];
	for (const county of counties) {
		const nameWords = words(county.name);
		const haystack = [...nameWords, ...words(county.stateName), normalize(county.stateUsps)];
		if (!typed.every((t) => haystack.some((w) => w.startsWith(t)))) continue;
		scored.push({ county, rank: nameWords[0]?.startsWith(typed[0]) ? 0 : 1 });
	}

	return scored
		.sort(
			(a, b) =>
				a.rank - b.rank ||
				a.county.name.localeCompare(b.county.name) ||
				a.county.stateName.localeCompare(b.county.stateName)
		)
		.slice(0, limit)
		.map((s) => s.county);
}
