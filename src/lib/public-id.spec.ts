import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizePublicId, PUBLIC_ID_ALPHABET, PUBLIC_ID_LETTERS } from './public-id';

describe('public ID alphabet', () => {
	// The database generates IDs and this module validates them; if the two alphabets
	// drift, valid IDs are rejected on re-import.
	it('matches the generator in the migration', () => {
		const sql = readFileSync('drizzle/0002_public_id_function.sql', 'utf8');
		expect(sql).toContain(`letters constant text := '${PUBLIC_ID_LETTERS}'`);
		expect(sql).toContain(`alphabet constant text := '${PUBLIC_ID_ALPHABET}'`);
	});

	it('has no vowels and no look-alike characters', () => {
		expect(PUBLIC_ID_ALPHABET).not.toMatch(/[aeiouy01l]/);
	});

	it('uses letters only from the alphabet', () => {
		for (const c of PUBLIC_ID_LETTERS) expect(PUBLIC_ID_ALPHABET).toContain(c);
		expect(PUBLIC_ID_LETTERS).not.toMatch(/\d/);
	});
});

describe('normalizePublicId', () => {
	it('accepts a well-formed ID, ignoring case and padding', () => {
		expect(normalizePublicId('b7k2m')).toBe('b7k2m');
		expect(normalizePublicId(' B7K2M ')).toBe('b7k2m');
	});

	it('rejects IDs that start with a digit, contain excluded characters, or are the wrong length', () => {
		expect(normalizePublicId('7bk2m')).toBeNull();
		expect(normalizePublicId('b0k2m')).toBeNull();
		expect(normalizePublicId('bak2m')).toBeNull();
		expect(normalizePublicId('b7k2')).toBeNull();
		expect(normalizePublicId('b7k2mm')).toBeNull();
		expect(normalizePublicId('')).toBeNull();
	});
});
