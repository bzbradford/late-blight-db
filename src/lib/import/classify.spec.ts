import { describe, expect, it } from 'vitest';
import type { IncidentInput } from '$lib/validation/incident';
import { classify, differingFields, reviewSignature, type ExistingRow } from './classify';
import type { ImportRow } from './rows';

const BASE: IncidentInput = {
	diseaseId: 1,
	countyFips: '55025',
	observedOn: '2026-09-19',
	reportedOn: '2026-09-19',
	crop: 'Potato',
	operationType: null,
	strain: 'US-23',
	comments: null,
	source: null
};
const LABEL = { disease: 'Late blight', county: 'Dane, WI' };

function row(n: number, overrides: Partial<IncidentInput> = {}, publicId: string | null = null) {
	return { row: n, publicId, values: { ...BASE, ...overrides }, label: LABEL } satisfies ImportRow;
}

function existing(id: number, overrides: Partial<ExistingRow> = {}): ExistingRow {
	return {
		...BASE,
		id,
		publicId: `b${id}ccc`.slice(0, 5),
		updatedAt: '2026-09-20T00:00:00.000Z',
		deletedAt: null,
		label: LABEL,
		...overrides
	};
}

describe('classify', () => {
	it('inserts a row with no counterpart', () => {
		expect(classify([row(2)], [])[0].kind).toBe('new');
	});

	it('skips a row identical to an existing detection', () => {
		expect(classify([row(2)], [existing(1)])[0].kind).toBe('identical');
	});

	it('makes a same-key row with different details a conflict, never an insert', () => {
		const [item] = classify([row(2, { crop: 'Tomato' })], [existing(1)]);
		expect(item).toMatchObject({
			kind: 'conflict',
			retracted: false,
			byId: false,
			choices: ['keep_existing', 'keep_new', 'keep_both'],
			defaultChoice: 'keep_existing'
		});
	});

	it('withholds "keep new" when several detections share the key', () => {
		const [item] = classify(
			[row(2, { crop: 'Onion' })],
			[existing(1), existing(2, { crop: 'Tomato' })]
		);
		expect(item).toMatchObject({ kind: 'conflict', choices: ['keep_existing', 'keep_both'] });
	});

	it('counts a row as identical if it matches any one of several same-key detections', () => {
		const [item] = classify(
			[row(2, { crop: 'Tomato' })],
			[existing(1), existing(2, { crop: 'Tomato' })]
		);
		expect(item.kind).toBe('identical');
	});

	it('does not quietly revive a retracted detection', () => {
		const [item] = classify([row(2)], [existing(1, { deletedAt: '2026-09-21T00:00:00Z' })]);
		expect(item).toMatchObject({
			kind: 'conflict',
			retracted: true,
			choices: ['keep_existing', 'keep_both'],
			defaultChoice: 'keep_existing'
		});
	});

	it('ignores retracted rows when an active one shares the key', () => {
		const [item] = classify(
			[row(2)],
			[existing(1, { deletedAt: '2026-09-21T00:00:00Z', crop: 'Tomato' }), existing(2)]
		);
		expect(item.kind).toBe('identical');
	});

	it('matches by id even when the date or county changed', () => {
		const target = existing(1);
		const [item] = classify([row(2, { observedOn: '2026-09-18' }, target.publicId)], [target]);
		expect(item).toMatchObject({
			kind: 'conflict',
			byId: true,
			choices: ['keep_existing', 'keep_new']
		});
	});

	it('offers only "keep existing" for an id naming a retracted detection', () => {
		const target = existing(1, { deletedAt: '2026-09-21T00:00:00Z' });
		const [item] = classify([row(2, { crop: 'Tomato' }, target.publicId)], [target]);
		expect(item).toMatchObject({ kind: 'conflict', retracted: true, choices: ['keep_existing'] });
	});

	it('handles duplicates inside the file', () => {
		const items = classify([row(2), row(3), row(4, { crop: 'Tomato' })], []);
		expect(items.map((i) => i.kind)).toEqual(['new', 'identical', 'conflict']);
		expect(items[2]).toMatchObject({
			match: { source: 'file', row: 2 },
			choices: ['keep_existing', 'keep_both']
		});
	});
});

describe('coordinates', () => {
	const HERE = { lat: 43.0731, lon: -89.4012 };

	it('never counts blank coordinates in a file as a change to stored ones', () => {
		const [item] = classify([row(2, { location: undefined })], [existing(1, { location: HERE })]);
		expect(item.kind).toBe('identical');
	});

	it('counts new or different coordinates as a change', () => {
		const added = classify([row(2, { location: HERE })], [existing(1, { location: null })]);
		expect(added[0].kind).toBe('conflict');
		const moved = classify(
			[row(2, { location: { lat: 43.1, lon: -89.4012 } })],
			[existing(1, { location: HERE })]
		);
		expect(moved[0].kind).toBe('conflict');
		expect(differingFields(existing(1, { location: HERE }), moved[0].row.values)).toEqual([
			'location'
		]);
	});

	it('matches identical coordinates', () => {
		const [item] = classify([row(2, { location: { ...HERE } })], [existing(1, { location: HERE })]);
		expect(item.kind).toBe('identical');
	});
});

describe('differingFields', () => {
	it('lists exactly the fields that differ', () => {
		expect(differingFields(BASE, { ...BASE, crop: 'Tomato', comments: 'x' })).toEqual([
			'crop',
			'comments'
		]);
	});
});

describe('reviewSignature', () => {
	it('changes when a matched detection is edited or retracted', () => {
		const rows = [row(2, { crop: 'Tomato' })];
		const before = reviewSignature(classify(rows, [existing(1)]));
		expect(reviewSignature(classify(rows, [existing(1)]))).toBe(before);
		expect(
			reviewSignature(classify(rows, [existing(1, { updatedAt: '2026-09-22T00:00:00Z' })]))
		).not.toBe(before);
		expect(
			reviewSignature(classify(rows, [existing(1, { deletedAt: '2026-09-22T00:00:00Z' })]))
		).not.toBe(before);
	});
});
