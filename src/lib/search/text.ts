/** Lowercase, without accents, so "dona ana" finds "Doña Ana". */
export function normalizeSearch(text: string): string {
	return text
		.toLowerCase()
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '');
}

/** The words of a search box, normalised. Empty when nothing but spaces was typed. */
export function searchTerms(query: string): string[] {
	return normalizeSearch(query).split(/\s+/).filter(Boolean);
}

/**
 * Every term appears somewhere in the (already normalised) text, in any order, so
 * "dane potato" finds a Dane County potato detection and "us-2" finds "US-23".
 */
export function matchesTerms(normalizedText: string, terms: string[]): boolean {
	return terms.every((term) => normalizedText.includes(term));
}
