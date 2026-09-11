/**
 * Inserts synthetic detections for local development.
 *
 * DEVELOPMENT ONLY — never run against production. It clears the incidents table
 * before inserting, and the data it writes is fabricated.
 *
 * The fixture deliberately spans:
 *   - both diseases
 *   - the current year (exercises the recency ramp) and a prior year (exercises the
 *     first-detection timing ramp)
 *   - counties with one detection and counties with several
 *   - rows with strain/crop present and rows with them null
 *
 * Usage: pnpm seed:dev
 */
import { sql } from 'drizzle-orm';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/lib/server/db/schema';
import { diseases, incidents } from '../src/lib/server/db/schema';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is not set');

if (process.env.NODE_ENV === 'production') {
	throw new Error('Refusing to run the development seed with NODE_ENV=production.');
}

const now = new Date();
const thisYear = now.getFullYear();
const lastYear = thisYear - 1;

/** Days before today, as an ISO date — used to place rows in the recency bins. */
function daysAgo(n: number) {
	const d = new Date(now);
	d.setDate(d.getDate() - n);
	return d.toISOString().slice(0, 10);
}

function onDate(year: number, month: number, day: number) {
	return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

type Row = {
	fips: string;
	observedOn: string;
	crop?: string;
	operationType?: string;
	strain?: string;
	comments?: string;
	source?: string;
};

// Late blight — potato/tomato production areas.
const LATE_BLIGHT: Row[] = [
	{
		fips: '55025',
		observedOn: daysAgo(3),
		crop: 'Potato',
		operationType: 'Commercial farm',
		strain: 'US-23',
		comments: 'Lesions on lower leaves following a week of cool wet weather.',
		source: 'UW-Madison Plant Disease Diagnostic Clinic'
	},
	{
		fips: '55078',
		observedOn: daysAgo(9),
		crop: 'Potato',
		operationType: 'Commercial farm',
		strain: 'US-23'
	},
	{
		fips: '36011',
		observedOn: daysAgo(19),
		crop: 'Tomato',
		operationType: 'Home garden',
		comments: 'Strain not determined.'
	},
	{
		fips: '42027',
		observedOn: daysAgo(41),
		crop: 'Tomato',
		operationType: 'Commercial farm',
		strain: 'US-24'
	},
	// Same county, two dates — the feed must group these and the choropleth must use
	// the most recent for the current-year ramp.
	{ fips: '55025', observedOn: daysAgo(28), crop: 'Tomato', operationType: 'Market garden' },
	// Prior season — drives the first-detection timing ramp.
	{ fips: '23019', observedOn: onDate(lastYear, 7, 14), crop: 'Potato', strain: 'US-23' },
	{ fips: '26077', observedOn: onDate(lastYear, 8, 2), crop: 'Potato' },
	{ fips: '36011', observedOn: onDate(lastYear, 9, 11), crop: 'Tomato', strain: 'US-23' }
];

// Cucurbit downy mildew — typically moves north through the season.
const CDM: Row[] = [
	{
		fips: '37117',
		observedOn: daysAgo(5),
		crop: 'Cucumber',
		operationType: 'Commercial farm',
		comments: 'Confirmed on scouting; sporulation on leaf undersides.'
	},
	{ fips: '39051', observedOn: daysAgo(12), crop: 'Cucumber', operationType: 'Commercial farm' },
	{ fips: '26021', observedOn: daysAgo(24), crop: 'Cucurbits', operationType: 'Commercial farm' },
	{ fips: '55025', observedOn: daysAgo(35), crop: 'Pumpkin', operationType: 'Market garden' },
	{ fips: '13107', observedOn: onDate(lastYear, 6, 22), crop: 'Cucumber' },
	{ fips: '37117', observedOn: onDate(lastYear, 7, 30), crop: 'Cucumber' }
];

/**
 * A known admin account so the end-to-end suite is reproducible from a clean
 * checkout. These credentials are fixed and public — which is exactly why this
 * script refuses to run under NODE_ENV=production.
 */
const DEV_ADMIN = {
	email: 'e2e-admin@example.com',
	name: 'E2E Admin',
	password: 'e2e-test-password-123'
};

const client = postgres(DATABASE_URL);
const db = drizzle(client, { schema });

try {
	const rows = await db.select({ id: diseases.id, slug: diseases.slug }).from(diseases);
	const byslug = new Map(rows.map((r) => [r.slug, r.id]));

	const lateBlightId = byslug.get('late-blight');
	const cdmId = byslug.get('cucurbit-downy-mildew');
	if (!lateBlightId || !cdmId) {
		throw new Error('Diseases are not seeded. Run `pnpm seed` first.');
	}

	await db.execute(sql`truncate table ${incidents} restart identity cascade`);

	const values = [
		...LATE_BLIGHT.map((r) => ({ ...r, diseaseId: lateBlightId })),
		...CDM.map((r) => ({ ...r, diseaseId: cdmId }))
	].map(({ fips, ...r }) => ({ ...r, countyFips: fips }));

	await db.insert(incidents).values(values);

	// Provision the development admin through Better Auth so the password hash matches
	// what the app will verify against.
	const auth = betterAuth({
		secret: process.env.BETTER_AUTH_SECRET ?? 'dev-only-secret-not-used-in-production',
		baseURL: process.env.ORIGIN ?? 'http://localhost:5173',
		database: drizzleAdapter(db, { provider: 'pg' }),
		emailAndPassword: { enabled: true, minPasswordLength: 12 }
	});
	const ctx = await auth.$context;
	const hash = await ctx.password.hash(DEV_ADMIN.password);
	const existing = await ctx.internalAdapter.findUserByEmail(DEV_ADMIN.email);

	if (existing) {
		await ctx.internalAdapter.updatePassword(existing.user.id, hash);
	} else {
		const user = await ctx.internalAdapter.createUser({
			email: DEV_ADMIN.email,
			name: DEV_ADMIN.name,
			emailVerified: true
		});
		await ctx.internalAdapter.createAccount({
			userId: user.id,
			providerId: 'credential',
			accountId: user.id,
			password: hash
		});
	}

	console.log(`Seeded ${values.length} synthetic detections.`);
	console.log(`  dev admin: ${DEV_ADMIN.email} / ${DEV_ADMIN.password}`);
	console.log(`  late blight: ${LATE_BLIGHT.length}, cucurbit downy mildew: ${CDM.length}`);
	console.log(`  years: ${lastYear}, ${thisYear}`);
} finally {
	await client.end();
}
