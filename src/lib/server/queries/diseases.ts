import { asc, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { diseases, incidents } from '$lib/server/db/schema';

export type Disease = {
	id: number;
	slug: string;
	name: string;
	scientificName: string | null;
};

export async function listDiseases(): Promise<Disease[]> {
	return db
		.select({
			id: diseases.id,
			slug: diseases.slug,
			name: diseases.name,
			scientificName: diseases.scientificName
		})
		.from(diseases)
		.orderBy(asc(diseases.sortOrder), asc(diseases.name));
}

/**
 * Years that actually have detections for a disease, newest first.
 *
 * Derived from the data rather than a hardcoded range so the year menu never offers
 * an empty year, and never omits one after a backfill. The current year is always
 * included even when empty — mid-season, "nothing reported yet" is itself the answer
 * a grower is looking for, and omitting it would make the menu jump to last year.
 */
export async function listYears(diseaseSlug: string): Promise<number[]> {
	const rows = await db
		.select({ year: sql<number>`extract(year from ${incidents.observedOn})::int` })
		.from(incidents)
		.innerJoin(diseases, eq(diseases.id, incidents.diseaseId))
		.where(sql`${diseases.slug} = ${diseaseSlug} and ${incidents.deletedAt} is null`)
		.groupBy(sql`1`);

	const years = new Set(rows.map((r) => r.year));
	years.add(new Date().getFullYear());
	return [...years].sort((a, b) => b - a);
}
