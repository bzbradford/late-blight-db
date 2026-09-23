import { and, asc, desc, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { auditLog, counties, diseases, incidents } from '$lib/server/db/schema';
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
	reportedOn: string | null;
	crop: string | null;
	operationType: string | null;
	strain: string | null;
	comments: string | null;
	source: string | null;
	deletedAt: Date | null;
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
	deletedAt: incidents.deletedAt
};

/**
 * Admin listing. Unlike the public queries this can include retracted rows — an admin
 * needs to see what was retracted in order to restore it.
 */
export async function listIncidents(filters: {
	diseaseId?: number;
	year?: number;
	includeDeleted?: boolean;
}): Promise<AdminIncident[]> {
	const where = [
		filters.diseaseId ? eq(incidents.diseaseId, filters.diseaseId) : undefined,
		filters.year ? sql`extract(year from ${incidents.observedOn}) = ${filters.year}` : undefined,
		filters.includeDeleted ? undefined : isNull(incidents.deletedAt)
	].filter(Boolean);

	return db
		.select(adminColumns)
		.from(incidents)
		.innerJoin(diseases, eq(diseases.id, incidents.diseaseId))
		.innerJoin(counties, eq(counties.fips, incidents.countyFips))
		.where(where.length ? and(...where) : undefined)
		.orderBy(desc(incidents.observedOn), desc(incidents.id));
}

/**
 * Every year with a detection, newest first, for the admin year filter. Retracted rows
 * count — the filter must be able to reach them — and so do all diseases, so the list
 * does not shift as the disease filter changes.
 */
export async function listIncidentYears(): Promise<number[]> {
	const year = sql<number>`extract(year from ${incidents.observedOn})::int`;
	const rows = await db.selectDistinct({ year }).from(incidents).orderBy(desc(year));
	return rows.map((r) => Number(r.year));
}

export async function getIncident(id: number): Promise<AdminIncident | undefined> {
	const rows = await db
		.select(adminColumns)
		.from(incidents)
		.innerJoin(diseases, eq(diseases.id, incidents.diseaseId))
		.innerJoin(counties, eq(counties.fips, incidents.countyFips))
		.where(eq(incidents.id, id))
		.limit(1);
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

type Actor = { id: string };

/** A transaction handle, so audit rows commit or roll back with the change they record. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function writeAudit(
	tx: Tx,
	action: string,
	rowId: number,
	actor: Actor,
	before: unknown,
	after: unknown
) {
	await tx.insert(auditLog).values({
		actorId: actor.id,
		tableName: 'incidents',
		rowId: String(rowId),
		action,
		before: before ?? null,
		after: after ?? null
	});
}

async function getIncidentTx(tx: Tx, id: number): Promise<AdminIncident | undefined> {
	const rows = await tx
		.select(adminColumns)
		.from(incidents)
		.innerJoin(diseases, eq(diseases.id, incidents.diseaseId))
		.innerJoin(counties, eq(counties.fips, incidents.countyFips))
		.where(eq(incidents.id, id))
		.limit(1);
	return rows[0];
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
async function insertIncident(tx: Tx, values: IncidentInput, actor: Actor) {
	for (let attempt = 1; ; attempt++) {
		try {
			return await tx.transaction(async (sp) => {
				const [row] = await sp
					.insert(incidents)
					.values({ ...values, createdBy: actor.id })
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
		const before = await getIncidentTx(tx, id);
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
		const before = await getIncidentTx(tx, id);
		await tx.update(incidents).set({ deletedAt: new Date() }).where(eq(incidents.id, id));
		await writeAudit(tx, 'retract', id, actor, before, null);
	});
}

export async function restoreIncident(id: number, actor: Actor) {
	await db.transaction(async (tx) => {
		const before = await getIncidentTx(tx, id);
		await tx.update(incidents).set({ deletedAt: null }).where(eq(incidents.id, id));
		await writeAudit(tx, 'restore', id, actor, before, null);
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
				const row = await insertIncident(tx, item.row.values, actor);
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
	return db
		.select(adminColumns)
		.from(incidents)
		.innerJoin(diseases, eq(diseases.id, incidents.diseaseId))
		.innerJoin(counties, eq(counties.fips, incidents.countyFips))
		.where(
			and(
				eq(incidents.diseaseId, values.diseaseId),
				eq(incidents.countyFips, values.countyFips),
				eq(incidents.observedOn, values.observedOn),
				isNull(incidents.deletedAt)
			)
		);
}
