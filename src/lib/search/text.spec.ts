import { describe, expect, it } from 'vitest';
import { matchesTerms, normalizeSearch, searchTerms } from './text';

const row = normalizeSearch('Doña Ana, NM · Late blight · Potato · US-23 · E2E Reporter');

describe('table search', () => {
	it('matches every word, in any order, ignoring case', () => {
		expect(matchesTerms(row, searchTerms('potato DOÑA'))).toBe(true);
		expect(matchesTerms(row, searchTerms('potato tomato'))).toBe(false);
	});

	it('ignores accents and matches inside words', () => {
		expect(matchesTerms(row, searchTerms('dona'))).toBe(true);
		expect(matchesTerms(row, searchTerms('us-2'))).toBe(true);
		expect(matchesTerms(row, searchTerms('blig'))).toBe(true);
	});

	it('treats a blank box as no search', () => {
		expect(searchTerms('   ')).toEqual([]);
		expect(matchesTerms(row, [])).toBe(true);
	});
});
