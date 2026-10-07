import type { IncidentInput } from '$lib/validation/incident';
import type { ImportRow } from './rows';

/** A detection already in the database that an imported row might duplicate. */
export type ExistingRow = IncidentInput & {
	id: number;
	publicId: string;
	/** ISO timestamp — part of the staleness check between review and confirm. */
	updatedAt: string;
	deletedAt: string | null;
	label: { disease: string; county: string };
};

/**
 * - `keep_existing` — skip the imported row.
 * - `keep_new` — overwrite the one matching detection with the imported values.
 * - `keep_both` — insert the imported row alongside what's there.
 */
export type Choice = 'keep_existing' | 'keep_new' | 'keep_both';

export type Match =
	| { source: 'database'; rows: ExistingRow[] }
	/** An earlier row of the same file, with the same disease + county + date. */
	| { source: 'file'; row: number; values: IncidentInput };

export type ImportItem =
	| { kind: 'new'; row: ImportRow }
	| { kind: 'identical'; row: ImportRow; match: Match }
	| {
			kind: 'conflict';
			row: ImportRow;
			match: Match;
			/** Only retracted detections matched. */
			retracted: boolean;
			/** Matched by the file's `id` column rather than by disease + county + date. */
			byId: boolean;
			choices: Choice[];
			defaultChoice: Choice;
	  };

/**
 * Every field that makes a detection what it is. `id`s and timestamps are bookkeeping;
 * `location` is compared on its own terms (`sameLocation`).
 */
const FIELDS: Exclude<keyof IncidentInput, 'location'>[] = [
	'diseaseId',
	'countyFips',
	'observedOn',
	'reportedOn',
	'crop',
	'operationType',
	'strain',
	'comments',
	'source'
];

/**
 * Coordinates count only when both sides say something: a row with blank coordinates
 * leaves stored ones alone (`undefined`), so it can't differ from them.
 */
function sameLocation(a: IncidentInput, b: IncidentInput): boolean {
	if (a.location === undefined || b.location === undefined) return true;
	if (a.location === null || b.location === null) return a.location === b.location;
	return a.location.lat === b.location.lat && a.location.lon === b.location.lon;
}

export function sameValues(a: IncidentInput, b: IncidentInput): boolean {
	return FIELDS.every((f) => (a[f] ?? null) === (b[f] ?? null)) && sameLocation(a, b);
}

/** The fields that differ, for highlighting on the review page. */
export function differingFields(a: IncidentInput, b: IncidentInput): (keyof IncidentInput)[] {
	const differing = FIELDS.filter((f) => (a[f] ?? null) !== (b[f] ?? null));
	return sameLocation(a, b) ? differing : [...differing, 'location'];
}

function key(v: IncidentInput): string {
	return `${v.diseaseId}|${v.countyFips}|${v.observedOn}`;
}

/**
 * Sorts every imported row into new / identical / conflict. Pure: the caller loads the
 * candidate `existing` rows (by public ID and by key, retracted ones included).
 *
 * Nothing here ever turns a possible duplicate into an insert on its own. A row that
 * could duplicate something becomes a conflict, and the conflict's default is always
 * the non-destructive choice, `keep_existing`.
 */
export function classify(rows: ImportRow[], existing: ExistingRow[]): ImportItem[] {
	const byPublicId = new Map(existing.map((e) => [e.publicId, e]));
	const byKey = new Map<string, ExistingRow[]>();
	for (const e of existing) byKey.set(key(e), [...(byKey.get(key(e)) ?? []), e]);

	const earlierInFile = new Map<string, ImportRow>();
	const items: ImportItem[] = [];

	for (const row of rows) {
		if (row.publicId) {
			items.push(classifyById(row, byPublicId.get(row.publicId)));
			continue;
		}

		const k = key(row.values);
		const earlier = earlierInFile.get(k);
		if (earlier) {
			const match: Match = { source: 'file', row: earlier.row, values: earlier.values };
			items.push(
				sameValues(row.values, earlier.values)
					? { kind: 'identical', row, match }
					: {
							kind: 'conflict',
							row,
							match,
							retracted: false,
							byId: false,
							// "Keep new" would mean un-choosing the earlier row, which the review
							// page can't express. Replace it in the file instead.
							choices: ['keep_existing', 'keep_both'],
							defaultChoice: 'keep_existing'
						}
			);
			continue;
		}
		earlierInFile.set(k, row);

		const candidates = byKey.get(k) ?? [];
		const active = candidates.filter((c) => !c.deletedAt);

		if (candidates.length === 0) {
			items.push({ kind: 'new', row });
		} else if (active.length === 0) {
			// Re-importing from an older database must not quietly undo a retraction.
			items.push({
				kind: 'conflict',
				row,
				match: { source: 'database', rows: candidates },
				retracted: true,
				byId: false,
				choices: ['keep_existing', 'keep_both'],
				defaultChoice: 'keep_existing'
			});
		} else if (active.some((a) => sameValues(a, row.values))) {
			items.push({ kind: 'identical', row, match: { source: 'database', rows: active } });
		} else {
			items.push({
				kind: 'conflict',
				row,
				match: { source: 'database', rows: active },
				retracted: false,
				byId: false,
				// With several candidates, "keep new" can't say which one to overwrite.
				choices:
					active.length === 1
						? ['keep_existing', 'keep_new', 'keep_both']
						: ['keep_existing', 'keep_both'],
				defaultChoice: 'keep_existing'
			});
		}
	}

	return items;
}

function classifyById(row: ImportRow, target: ExistingRow | undefined): ImportItem {
	// The caller has already rejected unknown IDs; this is only reachable if a detection
	// disappeared between loading and classifying, which cannot happen within one request.
	if (!target) throw new Error(`No detection with id ${row.publicId}`);

	const match: Match = { source: 'database', rows: [target] };
	if (sameValues(target, row.values)) return { kind: 'identical', row, match };

	return {
		kind: 'conflict',
		row,
		match,
		retracted: target.deletedAt !== null,
		byId: true,
		// An ID names exactly one detection, so "keep both" would copy it. A retracted
		// one is restored from its admin page first, not revived by an import.
		choices: target.deletedAt ? ['keep_existing'] : ['keep_existing', 'keep_new'],
		defaultChoice: 'keep_existing'
	};
}

/**
 * A digest of what the admin reviewed: each row's classification and the version of
 * every detection it matched. If this differs at confirm time, something changed in
 * between and the review is no longer the truth.
 */
export function reviewSignature(items: ImportItem[]): string {
	return items
		.map((item) => {
			const matched =
				item.kind !== 'new' && item.match.source === 'database'
					? item.match.rows.map((r) => `${r.id}@${r.updatedAt}@${r.deletedAt ?? ''}`).join(',')
					: '';
			return `${item.row.row}:${item.kind}:${matched}`;
		})
		.join(';');
}
