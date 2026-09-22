import Papa from 'papaparse';
import { CSV_COLUMNS, escapeCell, unescapeCell, type CsvColumn, type CsvRecord } from './columns';

/**
 * Excel opens a UTF-8 CSV without a byte-order mark as the local legacy encoding,
 * mangling any accented county name or typographic dash in a comment.
 */
const BOM = '\uFEFF';

export function toCsv(records: CsvRecord[]): string {
	const data = records.map((r) => CSV_COLUMNS.map((c) => escapeCell(r[c])));
	return BOM + Papa.unparse({ fields: [...CSV_COLUMNS], data }, { newline: '\r\n' });
}

export type ParsedCsv =
	{ ok: true; rows: Array<{ row: number; record: CsvRecord }> } | { ok: false; errors: string[] };

/**
 * Parses an uploaded CSV into records keyed by our column names.
 *
 * Headers are matched case-insensitively and unknown columns are ignored, so a sheet with
 * an extra "notes" column still imports.
 *
 * `row` is the spreadsheet row number (header = row 1), which is what an admin looks for.
 * It is not the line number in the file: a comment with a line break spans two lines but
 * one row. Blank rows are dropped but still counted, so numbering stays in step.
 */
export function parseCsv(text: string): ParsedCsv {
	const result = Papa.parse<Record<string, string>>(text.replace(/^\uFEFF/, ''), {
		header: true,
		skipEmptyLines: false,
		transformHeader: (h) => h.trim().toLowerCase()
	});

	const headers = new Set(result.meta.fields ?? []);
	const errors: string[] = [];

	if (!headers.has('disease')) errors.push('The file has no "disease" column.');
	if (!headers.has('observed_on')) errors.push('The file has no "observed_on" column.');
	if (!headers.has('county_fips') && !(headers.has('state') && headers.has('county'))) {
		errors.push('The file needs a "county_fips" column, or both "state" and "county".');
	}

	// Structural problems only (e.g. an unclosed quote). A short or long row is not one:
	// missing cells read as blank and are caught by per-row validation instead.
	for (const e of result.errors) {
		if (e.type === 'Quotes') {
			errors.push(`Row ${(e.row ?? 0) + 2}: ${e.message}.`);
		}
	}

	if (errors.length) return { ok: false, errors };

	const rows = result.data.flatMap((raw, i) => {
		const record = {} as CsvRecord;
		for (const c of CSV_COLUMNS) record[c as CsvColumn] = unescapeCell(raw[c] ?? '').trim();
		const blank = CSV_COLUMNS.every((c) => record[c] === '');
		return blank ? [] : [{ row: i + 2, record }];
	});

	return { ok: true, rows };
}
