import { createHash } from 'node:crypto';
import { parseCsv } from '$lib/csv/io';
import { classify, reviewSignature, type Choice, type ImportItem } from '$lib/import/classify';
import {
	buildCountyIndex,
	buildRow,
	isRowError,
	type ImportRow,
	type RowError
} from '$lib/import/rows';
import { findImportCandidates, listCounties } from '$lib/server/queries/admin';
import { listDiseases } from '$lib/server/queries/diseases';

/**
 * Upload limits. The byte cap sits under adapter-node's default `BODY_SIZE_LIMIT` (512 KB)
 * with room for the form's other fields, because the confirm step posts the CSV text back
 * — see `/admin/import`. 2,000 rows of this format is roughly 300 KB.
 */
export const MAX_IMPORT_BYTES = 400 * 1024;
export const MAX_IMPORT_ROWS = 2000;

export type PreparedImport =
	| { ok: false; fileErrors: string[]; rowErrors: RowError[] }
	| { ok: true; items: ImportItem[]; signature: string };

/**
 * Parses, validates, and classifies an import without writing anything.
 *
 * Run twice per import — once to build the review, and again on confirm from the same CSV
 * text — so confirm never trusts anything the browser sends back except the admin's
 * choices, and a change to the matched detections in between is detected by comparing
 * signatures.
 */
export async function prepareImport(csv: string): Promise<PreparedImport> {
	const parsed = parseCsv(csv);
	if (!parsed.ok) return { ok: false, fileErrors: parsed.errors, rowErrors: [] };
	if (parsed.rows.length === 0) {
		return { ok: false, fileErrors: ['The file has no detection rows.'], rowErrors: [] };
	}
	if (parsed.rows.length > MAX_IMPORT_ROWS) {
		return {
			ok: false,
			fileErrors: [
				`The file has ${parsed.rows.length} rows; the limit is ${MAX_IMPORT_ROWS}. Split it into smaller files.`
			],
			rowErrors: []
		};
	}

	const [diseases, counties] = await Promise.all([listDiseases(), listCounties()]);
	const context = { diseases, counties: buildCountyIndex(counties) };

	const built = parsed.rows.map(({ row, record }) => buildRow(row, record, context));
	const rowErrors: RowError[] = built.filter(isRowError);
	const rows: ImportRow[] = built.filter((r): r is ImportRow => !isRowError(r));

	// An ID names one detection; two rows claiming it can't both be applied.
	const firstRowWithId = new Map<string, number>();
	for (const r of rows) {
		if (!r.publicId) continue;
		const first = firstRowWithId.get(r.publicId);
		if (first !== undefined) {
			rowErrors.push({ row: r.row, messages: [`id ${r.publicId} is also used on row ${first}.`] });
		} else firstRowWithId.set(r.publicId, r.row);
	}

	const existing = await findImportCandidates(
		[...firstRowWithId.keys()],
		rows.map((r) => r.values)
	);

	const knownIds = new Set(existing.map((e) => e.publicId));
	for (const r of rows) {
		if (r.publicId && !knownIds.has(r.publicId)) {
			rowErrors.push({
				row: r.row,
				messages: [`id ${r.publicId} does not match any detection. Leave id blank for new rows.`]
			});
		}
	}

	if (rowErrors.length) {
		// One entry per row, however many checks it failed.
		const merged = new Map<number, string[]>();
		for (const e of rowErrors) merged.set(e.row, [...(merged.get(e.row) ?? []), ...e.messages]);
		return {
			ok: false,
			fileErrors: [],
			rowErrors: [...merged].sort(([a], [b]) => a - b).map(([row, messages]) => ({ row, messages }))
		};
	}

	const items = classify(rows, existing);
	const signature = createHash('sha256').update(reviewSignature(items)).digest('hex');
	return { ok: true, items, signature };
}

/**
 * Reads the admin's per-row choices from the confirm form. Anything missing or not
 * offered for that row falls back to the row's safe default rather than failing the
 * whole import.
 */
export function readChoices(form: FormData, items: ImportItem[]): Map<number, Choice> {
	const choices = new Map<number, Choice>();
	for (const item of items) {
		if (item.kind !== 'conflict') continue;
		const value = form.get(`choice-${item.row.row}`);
		const offered = item.choices.find((c) => c === value);
		choices.set(item.row.row, offered ?? item.defaultChoice);
	}
	return choices;
}
