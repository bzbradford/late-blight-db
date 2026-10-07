/**
 * Seeds reference data: the disease list and the county table.
 *
 * Idempotent and safe to run against production — it upserts and never deletes.
 * Run after `pnpm build:geo`, which generates `scripts/data/counties.csv`.
 *
 * Usage: pnpm seed
 */
import { readFileSync } from 'node:fs';
import { notInArray, sql } from 'drizzle-orm';
import Papa from 'papaparse';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { counties, diseases, incidents } from '../src/lib/server/db/schema';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is not set');

const DISEASES = [
	{
		slug: 'late-blight',
		name: 'Late blight',
		scientificName: 'Phytophthora infestans',
		sortOrder: 1
	},
	{
		slug: 'cucurbit-downy-mildew',
		name: 'Cucurbit downy mildew',
		scientificName: 'Pseudoperonospora cubensis',
		sortOrder: 2
	}
];

const COUNTY_COLUMNS = [
	'fips',
	'name',
	'full_name',
	'state_fips',
	'state_usps',
	'state_name',
	'lon',
	'lat'
];

function parseCounties(path: string) {
	// Quoted fields occur: "Stormont, Dundas and Glengarry".
	const { data, meta, errors } = Papa.parse<Record<string, string>>(readFileSync(path, 'utf8'), {
		header: true,
		skipEmptyLines: true
	});
	if (errors.length > 0) {
		throw new Error(`counties.csv line ${errors[0].row + 2}: ${errors[0].message}`);
	}
	if (meta.fields?.join(',') !== COUNTY_COLUMNS.join(',')) {
		throw new Error(`Unexpected counties.csv header: ${meta.fields?.join(',')}`);
	}
	return data.map((f) => ({
		fips: f.fips,
		name: f.name,
		fullName: f.full_name,
		stateFips: f.state_fips,
		stateUsps: f.state_usps,
		stateName: f.state_name,
		lon: Number(f.lon),
		lat: Number(f.lat)
	}));
}

const client = postgres(DATABASE_URL);
const db = drizzle(client);

try {
	for (const d of DISEASES) {
		await db
			.insert(diseases)
			.values(d)
			.onConflictDoUpdate({
				target: diseases.slug,
				set: { name: d.name, scientificName: d.scientificName, sortOrder: d.sortOrder }
			});
	}
	console.log(`Seeded ${DISEASES.length} diseases.`);

	const rows = parseCounties('scripts/data/counties.csv');
	// Chunked to stay well under the bind-parameter ceiling.
	const CHUNK = 500;
	for (let i = 0; i < rows.length; i += CHUNK) {
		await db
			.insert(counties)
			.values(rows.slice(i, i + CHUNK))
			.onConflictDoUpdate({
				target: counties.fips,
				set: {
					name: sql`excluded.name`,
					fullName: sql`excluded.full_name`,
					stateFips: sql`excluded.state_fips`,
					stateUsps: sql`excluded.state_usps`,
					stateName: sql`excluded.state_name`,
					lon: sql`excluded.lon`,
					lat: sql`excluded.lat`
				}
			});
	}
	console.log(`Seeded ${rows.length} counties.`);

	// Counties dropped from the source extract (e.g. when the geographic scope
	// narrowed to CONUS) must go, or they linger as clickable map targets that can
	// never hold data. Anything still referenced by an incident is kept and reported
	// rather than deleted — losing a real detection to a scope change would be far
	// worse than a stray county row.
	const keep = rows.map((r) => r.fips);
	const stale = await db
		.select({ fips: counties.fips, name: counties.name, stateUsps: counties.stateUsps })
		.from(counties)
		.where(notInArray(counties.fips, keep));

	if (stale.length > 0) {
		const referenced = await db
			.select({ fips: incidents.countyFips })
			.from(incidents)
			.where(notInArray(incidents.countyFips, keep));
		const blocked = new Set(referenced.map((r) => r.fips));

		const removable = stale.filter((c) => !blocked.has(c.fips));
		if (removable.length > 0) {
			await db.delete(counties).where(notInArray(counties.fips, keep.concat([...blocked])));
			console.log(`Removed ${removable.length} counties no longer in scope.`);
		}
		if (blocked.size > 0) {
			console.warn(
				`WARNING: ${blocked.size} out-of-scope counties kept because incidents reference them: ${[...blocked].join(', ')}`
			);
		}
	}
} finally {
	await client.end();
}
