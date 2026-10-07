/**
 * Validation shared by the client form and the server action.
 *
 * Deliberately hand-rolled rather than a schema library: the rules that actually matter
 * here are domain rules (a FIPS that exists, a date that is not in the future), and the
 * FIPS check needs the database anyway. A schema library would cover only the trivial half.
 */

import { isCountyKey } from '$lib/counties/key';

export type IncidentInput = {
	diseaseId: number;
	countyFips: string;
	observedOn: string;
	reportedOn: string;
	crop: string | null;
	operationType: string | null;
	strain: string | null;
	comments: string | null;
	source: string | null;
};

export type FieldErrors = Partial<Record<keyof IncidentInput, string>>;

/** Longest value we will store in any free-text field. */
const MAX_SHORT = 120;
const MAX_COMMENTS = 2000;

/**
 * Trim, collapse internal whitespace, and capitalise the first letter.
 *
 * Sentence case, never title case — title-casing mangles real crop names and fights
 * hyphenates. Free-text values converge through the form's suggestion list, not by
 * being rewritten here.
 */
export function normalizeText(value: FormDataEntryValue | null): string | null {
	if (value === null) return null;
	const collapsed = String(value).trim().replace(/\s+/g, ' ');
	if (collapsed === '') return null;
	return collapsed.charAt(0).toUpperCase() + collapsed.slice(1);
}

/** Comments keep their own casing and internal line breaks; only outer padding goes. */
export function normalizeComments(value: FormDataEntryValue | null): string | null {
	if (value === null) return null;
	const trimmed = String(value).trim();
	return trimmed === '' ? null : trimmed;
}

export function isIsoDate(value: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const [y, m, d] = value.split('-').map(Number);
	const date = new Date(Date.UTC(y, m - 1, d));
	return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Today in the server's local calendar, as `YYYY-MM-DD`. */
export function today(now = new Date()): string {
	const y = now.getFullYear();
	const m = String(now.getMonth() + 1).padStart(2, '0');
	const d = String(now.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

/**
 * The one cross-field date rule. Exported so the form can refuse to save as the admin
 * types; the server and the CSV importer apply it through `parseIncident`.
 */
export function reportedBeforeObserved(
	observedOn: string,
	reportedOn: string | null
): string | null {
	return reportedOn && observedOn && reportedOn < observedOn
		? 'A detection cannot be reported before it was observed.'
		: null;
}

/**
 * Anything with FormData's `get`. The CSV importer passes a plain adapter, so an imported
 * row goes through exactly the rules the form does.
 */
export type FieldSource = { get(name: string): FormDataEntryValue | null };

export function parseIncident(
	data: FieldSource,
	options: { todayIso?: string } = {}
): { values: IncidentInput; errors: FieldErrors } {
	const todayIso = options.todayIso ?? today();

	const values: IncidentInput = {
		diseaseId: Number(data.get('diseaseId')),
		countyFips: String(data.get('countyFips') ?? '').trim(),
		observedOn: String(data.get('observedOn') ?? '').trim(),
		reportedOn: String(data.get('reportedOn') ?? '').trim(),
		crop: normalizeText(data.get('crop')),
		operationType: normalizeText(data.get('operationType')),
		strain: normalizeText(data.get('strain')),
		comments: normalizeComments(data.get('comments')),
		source: normalizeText(data.get('source'))
	};

	const errors: FieldErrors = {};

	if (!Number.isInteger(values.diseaseId) || values.diseaseId <= 0) {
		errors.diseaseId = 'Choose a disease.';
	}

	// Shape only — that the county exists is checked against the database by the caller.
	if (!isCountyKey(values.countyFips)) {
		errors.countyFips = 'Choose a county.';
	}

	if (!values.observedOn) {
		errors.observedOn = 'Enter the date the detection was observed.';
	} else if (!isIsoDate(values.observedOn)) {
		errors.observedOn = 'Enter a valid date.';
	} else if (values.observedOn > todayIso) {
		errors.observedOn = 'The observation date cannot be in the future.';
	}

	if (!values.reportedOn) {
		errors.reportedOn = 'Enter the date the detection was reported.';
	} else if (!isIsoDate(values.reportedOn)) {
		errors.reportedOn = 'Enter a valid date.';
	} else if (values.reportedOn > todayIso) {
		errors.reportedOn = 'The report date cannot be in the future.';
	} else if (!errors.observedOn) {
		const order = reportedBeforeObserved(values.observedOn, values.reportedOn);
		if (order) errors.reportedOn = order;
	}

	for (const field of ['crop', 'operationType', 'strain', 'source'] as const) {
		const v = values[field];
		if (v && v.length > MAX_SHORT) {
			errors[field] = `Keep this under ${MAX_SHORT} characters.`;
		}
	}

	if (values.comments && values.comments.length > MAX_COMMENTS) {
		errors.comments = `Keep comments under ${MAX_COMMENTS} characters.`;
	}

	return { values, errors };
}

export function hasErrors(errors: FieldErrors): boolean {
	return Object.keys(errors).length > 0;
}
