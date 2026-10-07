/**
 * The detection CSV format — one spec for the public download, the import template, and
 * the importer, so a downloaded file can be edited and imported again unchanged.
 *
 * `id` is the public ID (never the internal serial key). On import it is optional: with
 * it, a row updates that detection; without it, rows match on disease + county + date.
 * The county is given by `county_fips`, or by `state` + `county` when FIPS is blank, or by
 * `latitude` + `longitude` when both are blank.
 *
 * `latitude` and `longitude` are private (see `incident_locations`): the template and the
 * importer have them, the admin download fills them, the public download leaves them out.
 * Blank coordinates on import leave stored ones alone, so re-importing a public download
 * can't wipe them.
 */
export const CSV_COLUMNS = [
	'id',
	'disease',
	'county_fips',
	'state',
	'county',
	'latitude',
	'longitude',
	'observed_on',
	'reported_on',
	'crop',
	'operation_type',
	'strain',
	'source',
	'comments'
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];
export type CsvRecord = Record<CsvColumn, string>;

/**
 * The downloads add who entered each row. Export-only: the importer ignores unknown
 * columns, so a downloaded file still re-imports, and an import is always credited to
 * the admin running it.
 */
export const EXPORT_COLUMNS = [...CSV_COLUMNS, 'reported_by'] as const;
export type ExportRecord = Record<(typeof EXPORT_COLUMNS)[number], string>;

const PRIVATE_COLUMNS: readonly string[] = ['latitude', 'longitude'];

/** The public download: everything but the private coordinates. */
export const PUBLIC_EXPORT_COLUMNS = EXPORT_COLUMNS.filter((c) => !PRIVATE_COLUMNS.includes(c));

/**
 * Characters that make a spreadsheet treat a cell as a formula. `comments` is free text,
 * and growers open these files in Excel, so a cell like `=HYPERLINK(...)` must not run.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

/** A plain number, such as a negative longitude: a spreadsheet reads it as a number, never a formula. */
const PLAIN_NUMBER = /^[+-]?\d+(\.\d+)?$/;

/** Prefix formula-like cells with `'`, which spreadsheets read as "this is text". */
export function escapeCell(value: string): string {
	return FORMULA_START.test(value) && !PLAIN_NUMBER.test(value) ? `'${value}` : value;
}

/**
 * Undo `escapeCell`, so a downloaded file re-imports with its original text. Only a `'`
 * followed by a formula character is removed — a comment that genuinely starts with an
 * apostrophe keeps it.
 */
export function unescapeCell(value: string): string {
	return value.startsWith("'") && FORMULA_START.test(value.slice(1)) ? value.slice(1) : value;
}

/** A blank record, for building rows column by column. */
export function emptyRecord(): CsvRecord {
	return Object.fromEntries(CSV_COLUMNS.map((c) => [c, ''])) as CsvRecord;
}

/**
 * The comment on the template's example row. The importer refuses a row carrying it, so
 * importing the template without editing it cannot create a detection.
 */
export const TEMPLATE_EXAMPLE_COMMENT = 'Example row: replace or delete before importing.';
