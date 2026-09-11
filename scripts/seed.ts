/**
 * Seeds reference data: the disease list and the county table.
 *
 * Idempotent and safe to run against production — it upserts and never deletes.
 * Run after `pnpm build:geo`, which generates `scripts/data/counties.csv`.
 *
 * Usage: pnpm seed
 */
import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { counties, diseases } from '../src/lib/server/db/schema';

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

const COUNTY_COLUMNS = ['fips', 'name', 'state_fips', 'state_usps', 'state_name', 'lon', 'lat'];

function parseCounties(path: string) {
	const lines = readFileSync(path, 'utf8').trim().split('\n');
	const header = lines[0].split(',');
	if (header.join(',') !== COUNTY_COLUMNS.join(',')) {
		throw new Error(`Unexpected counties.csv header: ${header.join(',')}`);
	}
	return lines.slice(1).map((line, i) => {
		const f = line.split(',');
		// The generator emits no quoted fields; assert rather than silently mis-parse.
		if (f.length !== COUNTY_COLUMNS.length) {
			throw new Error(`counties.csv line ${i + 2} has ${f.length} fields, expected 7`);
		}
		return {
			fips: f[0],
			name: f[1],
			stateFips: f[2],
			stateUsps: f[3],
			stateName: f[4],
			lon: Number(f[5]),
			lat: Number(f[6])
		};
	});
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
					stateFips: sql`excluded.state_fips`,
					stateUsps: sql`excluded.state_usps`,
					stateName: sql`excluded.state_name`,
					lon: sql`excluded.lon`,
					lat: sql`excluded.lat`
				}
			});
	}
	console.log(`Seeded ${rows.length} counties.`);
} finally {
	await client.end();
}
