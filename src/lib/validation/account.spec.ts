import { describe, expect, it } from 'vitest';
import {
	checkNewPassword,
	formatReporter,
	isEmail,
	MIN_PASSWORD_LENGTH,
	normalizeEmail,
	parseProfile
} from './account';

function form(values: Record<string, string>) {
	const data = new FormData();
	for (const [k, v] of Object.entries(values)) data.set(k, v);
	return data;
}

describe('parseProfile', () => {
	it('collapses whitespace but keeps the owner’s casing', () => {
		const { values, errors } = parseProfile(
			form({ name: '  Jane   van der Berg ', affiliation: ' UW–Madison  Plant Pathology ' })
		);
		expect(values).toEqual({
			name: 'Jane van der Berg',
			affiliation: 'UW–Madison Plant Pathology'
		});
		expect(errors).toEqual({});
	});

	it('requires a name; affiliation is optional', () => {
		const { values, errors } = parseProfile(form({ name: '   ', affiliation: '' }));
		expect(values.affiliation).toBeNull();
		expect(errors.name).toBeDefined();
		expect(errors.affiliation).toBeUndefined();
	});

	it('limits lengths', () => {
		const { errors } = parseProfile(form({ name: 'x'.repeat(81), affiliation: 'y'.repeat(121) }));
		expect(errors.name).toBeDefined();
		expect(errors.affiliation).toBeDefined();
	});
});

describe('checkNewPassword', () => {
	const ok = 'p'.repeat(MIN_PASSWORD_LENGTH);

	it('accepts a long-enough matching pair', () => {
		expect(checkNewPassword(ok, ok)).toBeNull();
	});

	it('refuses short, overlong, and mismatched passwords', () => {
		expect(checkNewPassword(ok.slice(1), ok.slice(1))).toMatch(/at least/);
		expect(checkNewPassword('p'.repeat(129), 'p'.repeat(129))).toMatch(/at most/);
		expect(checkNewPassword(ok, `${ok}x`)).toMatch(/match/);
	});
});

describe('email helpers', () => {
	it('normalizes and checks addresses', () => {
		expect(normalizeEmail('  Jane@WISC.edu ')).toBe('jane@wisc.edu');
		expect(isEmail('jane@wisc.edu')).toBe(true);
		expect(isEmail('jane@wisc')).toBe(false);
		expect(isEmail('jane doe@wisc.edu')).toBe(false);
	});
});

describe('formatReporter', () => {
	it('adds the affiliation when there is one', () => {
		expect(formatReporter({ name: 'Jane Doe', affiliation: 'UW–Madison' })).toBe(
			'Jane Doe · UW–Madison'
		);
		expect(formatReporter({ name: 'Jane Doe', affiliation: null })).toBe('Jane Doe');
	});
});
