import { error } from '@sveltejs/kit';
import { and, asc, eq, exists, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { canDeleteIncident, canEditIncident, type Viewer } from '$lib/auth/roles';
import { db } from '$lib/server/db';
import { counties, diseases, incidents, user } from '$lib/server/db/schema';
import { recordAudit, type Tx } from '$lib/server/queries/audit';
import type { Choice, ExistingRow, ImportItem } from '$lib/import/classify';
import type { IncidentInput } from '$lib/validation/incident';

export type AdminIncident = {
	id: number;
	publicId: string;
	diseaseId: number;
	diseaseName: string;
	countyFips: string;
	countyName: string;
	stateUsps: string;
	observedOn: string;
	reportedOn: string;
	crop: string | null;
	operationType: string | null;
	strain: string | null;
	comments: string | null;
	source: string | null;
	deletedAt: Date | null;
	/** Internal user ID of whoever entered it; admin pages only, never public. */
	createdBy: string | null;
	reporterName: string | null;
	reporterAffiliation: string | null;
	imported: boolean;
};

const adminColumns = {
	id: incidents.id,
	publicId: incidents.publicId,
	diseaseId: incidents.diseaseId,
	diseaseName: diseases.name,
	countyFips: incidents.countyFips,
	countyName: counties.name,
	stateUsps: counties.stateUsps,
	observedOn: incidents.observedOn,
	reportedOn: incidents.reportedOn,
	crop: incidents.crop,
	operationType: incidents.operationType,
	strain: incidents.strain,
	comments: incidents.comments,
	source: incidents.source,
	deletedAt: incidents.deletedAt,
	createdBy: incidents.createdBy,
	reporterName: user.name,
	reporterAffiliation: user.affiliation,
	imported: incidents.imported
};

/** Incidents with the joins `adminColumns` reads, on the connection or in a transaction. */
function selectAdmin(conn: Tx | typeof db = db) {
	return conn
		.select(adminColumns)
		.from(incidents)
		.innerJoin(diseases, eq(diseases.id, incidents.diseaseId))
		.innerJoin(counties, eq(counties.fips, incidents.countyFips))
		.leftJoin(user, eq(user.id, incidents.createdBy));
}

/**
 * Everyone who has entered at least one detection, retracted or not, for the admin
 * table's "Reported by" filter. Deactivated users stay: their detections still exist.
 */
export async function listReporters(): Promise<{ id: string; name: string }[]> {
	return db
		.select({ id: user.id, name: user.name })
		.from(user)
		.where(
			exists(
				db
					.select({ one: sql`1` })
					.from(incidents)
					.where(eq(incidents.createdBy, user.id))
			)
		)
		.orderBy(asc(user.name));
}

export async function getIncident(id: number): Promise<AdminIncident | undefined> {
	const rows = await selectAdmin().where(eq(incidents.id, id)).limit(1);
	return rows[0];
}

export async function countyExists(fips: string): Promise<boolean> {
	const rows = await db
		.select({ fips: counties.fips })
		.from(counties)
		.where(eq(counties.fips, fips))
		.limit(1);
	return rows.length > 0;
}

export type CountyOption = { fips: string; name: string; stateUsps: string; stateName: string };

export async function listCounties(): Promise<CountyOption[]> {
	return db
		.select({
			fips: counties.fips,
			name: counties.name,
			stateUsps: counties.stateUsps,
			stateName: counties.stateName
		})
		.from(counties)
		.orderBy(asc(counties.stateName), asc(counties.name));
}

/**
 * Values already used for the free-text fields, to offer as suggestions.
 *
 * These fields are intentionally unconstrained, so this is the only mechanism pulling
 * spellings back together — an admin picks "Potato" from the list instead of typing
 * "potatoes". Retracted rows still count: a spelling does not stop existing because a
 * detection was withdrawn.
 */
export async function listFieldSuggestions(): Promise<{
	crop: string[];
	operationType: string[];
	strain: string[];
	source: string[];
}> {
	const [crop, operationType, strain, source] = await Promise.all(
		([incidents.crop, incidents.operationType, incidents.strain, incidents.source] as const).map(
			async (column) =>
				(
					await db
						.selectDistinct({ value: column })
						.from(incidents)
						.where(isNotNull(column))
						.orderBy(asc(column))
				)
					.map((r) => r.value)
					.filter((v): v is string => v !== null)
		)
	);
	return { crop, operationType, strain, source };
}

/** Who is making a change, and in what role. Every mutation checks it. */
type Actor = Viewer;

async function writeAudit(
	tx: Tx,
	action: string,
	rowId: number,
	actor: Actor,
	before: unknown,
	after: unknown
) {
	await recordAudit(tx, { table: 'incidents', rowId, action, actorId: actor.id, before, after });
}

async function getIncidentTx(tx: Tx, id: number): Promise<AdminIncident | undefined> {
	const rows = await selectAdmin(tx).where(eq(incidents.id, id)).limit(1);
	return rows[0];
}

/**
 * The row as it stands, provided the actor may change it. Checked inside the transaction
 * that makes the change, so a hidden button is never the only thing in the way.
 */
async function editableIncident(tx: Tx, id: number, actor: Actor): Promise<AdminIncident> {
	const row = await getIncidentTx(tx, id);
	if (!row) error(404, 'Not found');
	if (!canEditIncident(actor, row.createdBy)) {
		error(403, 'Only the person who entered this detection, or an admin, can change it.');
	}
	return row;
}

const PUBLIC_ID_ATTEMPTS = 5;

/** Postgres reports a unique violation as SQLSTATE 23505; Drizzle may wrap the error. */
function isPublicIdCollision(err: unknown): boolean {
	for (let e: unknown = err; e && typeof e === 'object'; e = (e as { cause?: unknown }).cause) {
		const { code, constraint_name } = e as { code?: string; constraint_name?: string };
		if (code === '23505' && constraint_name === 'incidents_public_id_unique') return true;
	}
	return false;
}

/**
 * Inserts an incident, retrying if the database happens to generate a public ID that is
 * already taken. The ID space (~10 M) makes that rare, but it is not impossible, and the
 * unique index — not luck — is what guarantees uniqueness.
 *
 * Each attempt runs in a savepoint: in Postgres a failed statement aborts the whole
 * transaction, so a bare retry would fail on "current transaction is aborted".
 */
async function insertIncident(tx: Tx, values: IncidentInput, actor: Actor, imported = false) {
	for (let attempt = 1; ; attempt++) {
		try {
			return await tx.transaction(async (sp) => {
				const [row] = await sp
					.insert(incidents)
					.values({ ...values, createdBy: actor.id, imported })
					.returning({ id: incidents.id, publicId: incidents.publicId });
				return row;
			});
		} catch (err) {
			if (attempt < PUBLIC_ID_ATTEMPTS && isPublicIdCollision(err)) continue;
			throw err;
		}
	}
}

export async function createIncident(input: IncidentInput, actor: Actor): Promise<number> {
	return db.transaction(async (tx) => {
		const row = await insertIncident(tx, input, actor);
		await writeAudit(tx, 'create', row.id, actor, null, input);
		return row.id;
	});
}

export async function updateIncident(id: number, input: IncidentInput, actor: Actor) {
	await db.transaction(async (tx) => {
		const before = await editableIncident(tx, id, actor);
		await tx
			.update(incidents)
			.set({ ...input, updatedAt: new Date() })
			.where(eq(incidents.id, id));
		await writeAudit(tx, 'update', id, actor, before, input);
	});
}

/**
 * Retraction is a soft delete. The row leaves the public map but stays auditable — a
 * withdrawn detection is itself a fact worth keeping, and hard deletion would also
 * silently orphan the audit trail.
 */
export async function retractIncident(id: number, actor: Actor) {
	await db.transaction(async (tx) => {
		const before = await editableIncident(tx, id, actor);
		await tx.update(incidents).set({ deletedAt: new Date() }).where(eq(incidents.id, id));
		await writeAudit(tx, 'retract', id, actor, before, null);
	});
}

export async function restoreIncident(id: number, actor: Actor) {
	await db.transaction(async (tx) => {
		const before = await editableIncident(tx, id, actor);
		await tx.update(incidents).set({ deletedAt: null }).where(eq(incidents.id, id));
		await writeAudit(tx, 'restore', id, actor, before, null);
	});
}

/**
 * Permanently removes a detection that was entered in error. Admin-only, and only for one
 * already retracted, so a live detection can never vanish in one step. The audit row keeps
 * the full record as it stood (`audit_log.row_id` is not a foreign key), so the deletion
 * itself stays accountable even though the detection is gone.
 */
export async function deleteIncident(id: number, actor: Actor) {
	if (!canDeleteIncident(actor)) error(403, 'Only an admin can delete a detection.');
	await db.transaction(async (tx) => {
		const [before] = await selectAdmin(tx)
			.where(eq(incidents.id, id))
			.limit(1)
			.for('update', { of: incidents });
		if (!before) error(404, 'Not found');
		if (!before.deletedAt) error(409, 'Retract a detection before deleting it.');
		await tx.delete(incidents).where(eq(incidents.id, id));
		await writeAudit(tx, 'delete', id, actor, before, null);
	});
}

// --- CSV import ---------------------------------------------------------------------

/**
 * Detections an import might touch: those named by public ID, and those sharing a county
 * and date with an imported row (the classifier narrows that to the exact disease + county
 * + date key). Retracted rows are included on purpose, so an import can't revive one
 * without the admin seeing it.
 */
export async function findImportCandidates(
	publicIds: string[],
	keys: { countyFips: string; observedOn: string }[]
): Promise<ExistingRow[]> {
	const fips = [...new Set(keys.map((k) => k.countyFips))];
	const dates = [...new Set(keys.map((k) => k.observedOn))];
	const conditions = [
		publicIds.length ? inArray(incidents.publicId, publicIds) : undefined,
		fips.length
			? and(inArray(incidents.countyFips, fips), inArray(incidents.observedOn, dates))
			: undefined
	].filter(Boolean);
	if (conditions.length === 0) return [];

	const rows = await db
		.select({
			id: incidents.id,
			publicId: incidents.publicId,
			diseaseId: incidents.diseaseId,
			diseaseName: diseases.name,
			countyFips: incidents.countyFips,
			countyName: counties.name,
			stateUsps: counties.stateUsps,
			observedOn: incidents.observedOn,
			reportedOn: incidents.reportedOn,
			crop: incidents.crop,
			operationType: incidents.operationType,
			strain: incidents.strain,
			comments: incidents.comments,
			source: incidents.source,
			updatedAt: incidents.updatedAt,
			deletedAt: incidents.deletedAt
		})
		.from(incidents)
		.innerJoin(diseases, eq(diseases.id, incidents.diseaseId))
		.innerJoin(counties, eq(counties.fips, incidents.countyFips))
		.where(or(...conditions));

	return rows.map(({ diseaseName, countyName, stateUsps, updatedAt, deletedAt, ...r }) => ({
		...r,
		updatedAt: updatedAt.toISOString(),
		deletedAt: deletedAt?.toISOString() ?? null,
		label: { disease: diseaseName, county: `${countyName}, ${stateUsps}` }
	}));
}

export type ImportSummary = { added: number; updated: number; identical: number; kept: number };

/**
 * Applies a reviewed import in one transaction: every insert and update, and the audit
 * row for each, commit together or not at all.
 *
 * Audit rows use their own actions (`import`, `import-update`) and record the file and
 * row, so a bulk load can be traced back to its source and reviewed as a unit.
 */
export async function applyImport(
	items: ImportItem[],
	choices: Map<number, Choice>,
	actor: Actor,
	fileName: string
): Promise<ImportSummary> {
	// Import back-loads history and can overwrite anyone's detection — admins only (D20).
	// guardAdmin already refuses the route; this holds wherever it is called from.
	if (actor.role !== 'admin') error(403, 'Only admins can import detections.');

	const summary: ImportSummary = { added: 0, updated: 0, identical: 0, kept: 0 };

	await db.transaction(async (tx) => {
		for (const item of items) {
			const provenance = { file: fileName, row: item.row.row };

			if (item.kind === 'identical') {
				summary.identical++;
				continue;
			}

			const choice =
				item.kind === 'new' ? 'keep_both' : (choices.get(item.row.row) ?? 'keep_existing');
			// Choices come from the browser; anything not offered for this row is ignored.
			if (item.kind === 'conflict' && !item.choices.includes(choice)) {
				throw new Error(`Row ${item.row.row}: "${choice}" is not an option for this row.`);
			}

			if (choice === 'keep_existing') {
				summary.kept++;
			} else if (choice === 'keep_both') {
				const row = await insertIncident(tx, item.row.values, actor, true);
				await writeAudit(tx, 'import', row.id, actor, null, { ...item.row.values, provenance });
				summary.added++;
			} else {
				// `keep_new` is only offered against exactly one detection in the database.
				if (item.kind !== 'conflict' || item.match.source !== 'database') {
					throw new Error(`Row ${item.row.row}: nothing to update.`);
				}
				const [target] = item.match.rows;
				const before = await getIncidentTx(tx, target.id);
				await tx
					.update(incidents)
					.set({ ...item.row.values, updatedAt: new Date() })
					.where(eq(incidents.id, target.id));
				await writeAudit(tx, 'import-update', target.id, actor, before, {
					...item.row.values,
					provenance
				});
				summary.updated++;
			}
		}
	});

	return summary;
}

/**
 * Active detections with the same disease, county, and date — what the single-entry form
 * warns about before saving a likely duplicate.
 */
export async function findSameDayDetections(
	values: Pick<IncidentInput, 'diseaseId' | 'countyFips' | 'observedOn'>
): Promise<AdminIncident[]> {
	return selectAdmin().where(
		and(
			eq(incidents.diseaseId, values.diseaseId),
			eq(incidents.countyFips, values.countyFips),
			eq(incidents.observedOn, values.observedOn),
			isNull(incidents.deletedAt)
		)
	);
}
