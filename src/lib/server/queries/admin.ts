import { and, asc, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { auditLog, counties, diseases, incidents } from '$lib/server/db/schema';
import type { IncidentInput } from '$lib/validation/incident';

export type AdminIncident = {
	id: number;
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

async function writeAudit(
	action: string,
	rowId: number,
	actor: Actor,
	before: unknown,
	after: unknown
) {
	await db.insert(auditLog).values({
		actorId: actor.id,
		tableName: 'incidents',
		rowId: String(rowId),
		action,
		before: before ?? null,
		after: after ?? null
	});
}

export async function createIncident(input: IncidentInput, actor: Actor): Promise<number> {
	const [row] = await db
		.insert(incidents)
		.values({ ...input, createdBy: actor.id })
		.returning({ id: incidents.id });
	await writeAudit('create', row.id, actor, null, input);
	return row.id;
}

export async function updateIncident(id: number, input: IncidentInput, actor: Actor) {
	const before = await getIncident(id);
	await db
		.update(incidents)
		.set({ ...input, updatedAt: new Date() })
		.where(eq(incidents.id, id));
	await writeAudit('update', id, actor, before, input);
}

/**
 * Retraction is a soft delete. The row leaves the public map but stays auditable — a
 * withdrawn detection is itself a fact worth keeping, and hard deletion would also
 * silently orphan the audit trail.
 */
export async function retractIncident(id: number, actor: Actor) {
	const before = await getIncident(id);
	await db.update(incidents).set({ deletedAt: new Date() }).where(eq(incidents.id, id));
	await writeAudit('retract', id, actor, before, null);
}

export async function restoreIncident(id: number, actor: Actor) {
	const before = await getIncident(id);
	await db.update(incidents).set({ deletedAt: null }).where(eq(incidents.id, id));
	await writeAudit('restore', id, actor, before, null);
}
