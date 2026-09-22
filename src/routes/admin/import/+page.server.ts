import { fail } from '@sveltejs/kit';
import {
	MAX_IMPORT_BYTES,
	MAX_IMPORT_ROWS,
	prepareImport,
	readChoices,
	type PreparedImport
} from '$lib/server/import';
import { applyImport } from '$lib/server/queries/admin';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({
	maxBytes: MAX_IMPORT_BYTES,
	maxRows: MAX_IMPORT_ROWS
});

type Prepared = Extract<PreparedImport, { ok: true }>;

function review(fileName: string, csv: string, prepared: Prepared, stale = false) {
	return {
		stage: 'review' as const,
		fileName,
		// Posted back unchanged on confirm and re-validated from scratch there, so nothing
		// the browser holds between the two steps is trusted.
		csv,
		signature: prepared.signature,
		items: prepared.items,
		stale
	};
}

function errors(
	fileName: string,
	fileErrors: string[],
	rowErrors: { row: number; messages: string[] }[]
) {
	return fail(400, { stage: 'errors' as const, fileName, fileErrors, rowErrors });
}

export const actions: Actions = {
	review: async ({ request }) => {
		const form = await request.formData();
		const file = form.get('file');
		if (!(file instanceof File) || file.size === 0) {
			return errors('', ['Choose a CSV file to import.'], []);
		}
		if (file.size > MAX_IMPORT_BYTES) {
			return errors(
				file.name,
				[`The file is larger than ${MAX_IMPORT_BYTES / 1024} KB. Split it into smaller files.`],
				[]
			);
		}

		const csv = await file.text();
		const prepared = await prepareImport(csv);
		if (!prepared.ok) return errors(file.name, prepared.fileErrors, prepared.rowErrors);
		return review(file.name, csv, prepared);
	},

	confirm: async ({ request, locals }) => {
		// guardAdmin in hooks.server.ts has already refused anonymous requests.
		const actor = { id: locals.user!.id };
		const form = await request.formData();
		const csv = String(form.get('csv') ?? '');
		const fileName = String(form.get('fileName') ?? '').slice(0, 200) || 'upload.csv';
		const reviewed = String(form.get('signature') ?? '');

		const prepared = await prepareImport(csv);
		if (!prepared.ok) return errors(fileName, prepared.fileErrors, prepared.rowErrors);

		// A matched detection was edited, retracted, or created since the review was built.
		// The choices were made against something that no longer exists; show it again.
		if (prepared.signature !== reviewed) {
			return fail(409, review(fileName, csv, prepared, true));
		}

		const summary = await applyImport(
			prepared.items,
			readChoices(form, prepared.items),
			actor,
			fileName
		);
		return { stage: 'done' as const, fileName, summary };
	}
};
