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
import { eq, sql } from 'drizzle-orm';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/lib/server/db/schema';
import { diseases, incidents, invitations, user } from '../src/lib/server/db/schema';
import { today } from '../src/lib/validation/incident';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is not set');

if (process.env.NODE_ENV === 'production') {
	throw new Error('Refusing to run the development seed with NODE_ENV=production.');
}
// Also by where the app is served, which doesn't depend on a shell profile setting
// NODE_ENV: any deployed ORIGIN has a real hostname.
const origin = process.env.ORIGIN ? new URL(process.env.ORIGIN).hostname : 'localhost';
if (origin !== 'localhost' && origin !== '127.0.0.1') {
	throw new Error(`Refusing to run the development seed for ORIGIN ${process.env.ORIGIN}.`);
}

const now = new Date();
const thisYear = now.getFullYear();
const lastYear = thisYear - 1;

/**
 * Days before today, as an ISO date — used to place rows in the recency bins. Local
 * calendar date, as the app reckons "today": `toISOString()` would give the UTC date,
 * a day ahead every evening in the Americas, and the e2e "(3 days ago)" would read 2.
 */
function daysAgo(n: number) {
	const d = new Date(now);
	d.setDate(d.getDate() - n);
	return today(d);
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
	/** Entered by the dev reporter rather than the dev admin. */
	byReporter?: boolean;
	/** Came in by CSV import — shown as "Imported by". */
	imported?: boolean;
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
		source: 'UW-Madison Plant Disease Diagnostic Clinic',
		byReporter: true
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
	// Back-loaded by CSV import.
	{
		fips: '23019',
		observedOn: onDate(lastYear, 7, 14),
		crop: 'Potato',
		strain: 'US-23',
		imported: true
	},
	{ fips: '26077', observedOn: onDate(lastYear, 8, 2), crop: 'Potato', imported: true },
	{
		fips: '36011',
		observedOn: onDate(lastYear, 9, 11),
		crop: 'Tomato',
		strain: 'US-23',
		imported: true
	}
];

// Cucurbit downy mildew — typically moves north through the season.
const CDM: Row[] = [
	{
		fips: '37117',
		observedOn: daysAgo(5),
		crop: 'Cucumber',
		operationType: 'Commercial farm',
		comments: 'Confirmed on scouting; sporulation on leaf undersides.',
		byReporter: true
	},
	{
		fips: '39051',
		observedOn: daysAgo(12),
		crop: 'Cucumber',
		operationType: 'Commercial farm',
		byReporter: true
	},
	{ fips: '26021', observedOn: daysAgo(24), crop: 'Cucurbits', operationType: 'Commercial farm' },
	{ fips: '55025', observedOn: daysAgo(35), crop: 'Pumpkin', operationType: 'Market garden' },
	{ fips: '13107', observedOn: onDate(lastYear, 6, 22), crop: 'Cucumber' },
	{ fips: '37117', observedOn: onDate(lastYear, 7, 30), crop: 'Cucumber' }
];

/**
 * Known accounts so the end-to-end suite is reproducible from a clean checkout. These
 * credentials are fixed and public — which is exactly why this script refuses to run
 * under NODE_ENV=production.
 */
const DEV_ADMIN = {
	email: 'e2e-admin@example.com',
	name: 'E2E Admin',
	affiliation: 'Dev Extension Office',
	password: 'e2e-test-password-123',
	role: 'admin'
};
const DEV_REPORTER = {
	email: 'e2e-reporter@example.com',
	name: 'E2E Reporter',
	affiliation: 'Dev County Extension',
	password: 'e2e-test-password-456',
	role: 'reporter'
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

	// Provision the development accounts through Better Auth so the password hashes match
	// what the app will verify against. Role, profile, and active status are reset every
	// run, so a test that deactivated or demoted one can't leak into the next run.
	const auth = betterAuth({
		secret: process.env.BETTER_AUTH_SECRET ?? 'dev-only-secret-not-used-in-production',
		baseURL: process.env.ORIGIN ?? 'http://localhost:5173',
		database: drizzleAdapter(db, { provider: 'pg' }),
		emailAndPassword: { enabled: true, minPasswordLength: 12 }
	});
	const ctx = await auth.$context;

	async function provision(account: typeof DEV_ADMIN): Promise<string> {
		const hash = await ctx.password.hash(account.password);
		const existing = await ctx.internalAdapter.findUserByEmail(account.email);
		let id: string;
		if (existing) {
			id = existing.user.id;
			await ctx.internalAdapter.updatePassword(id, hash);
		} else {
			const created = await ctx.internalAdapter.createUser({
				email: account.email,
				name: account.name,
				emailVerified: true
			});
			id = created.id;
			await ctx.internalAdapter.createAccount({
				userId: id,
				providerId: 'credential',
				accountId: id,
				password: hash
			});
		}
		await db
			.update(user)
			.set({
				name: account.name,
				affiliation: account.affiliation,
				role: account.role,
				// Fixed and early, so the dev admin outranks any admin the e2e suite invites.
				adminSince: account.role === 'admin' ? new Date('2020-01-01T12:00:00Z') : null,
				deactivatedAt: null
			})
			.where(eq(user.id, id));
		return id;
	}

	// Accounts the e2e suite created by invitation on earlier runs. The app never deletes
	// users, but these are throwaway fixtures in a development database.
	await db.execute(sql`delete from ${invitations}`);
	await db.execute(sql`delete from ${user} where ${user.email} like 'invitee-%@example.com'`);

	const adminId = await provision(DEV_ADMIN);
	const reporterId = await provision(DEV_REPORTER);

	await db.execute(sql`truncate table ${incidents} restart identity cascade`);

	const values = [
		...LATE_BLIGHT.map((r) => ({ ...r, diseaseId: lateBlightId })),
		...CDM.map((r) => ({ ...r, diseaseId: cdmId }))
	].map(({ fips, byReporter, imported, ...r }) => ({
		...r,
		countyFips: fips,
		reportedOn: r.observedOn,
		createdBy: byReporter ? reporterId : adminId,
		imported: imported ?? false
	}));

	await db.insert(incidents).values(values);

	console.log(`Seeded ${values.length} synthetic detections.`);
	console.log(`  dev admin: ${DEV_ADMIN.email} / ${DEV_ADMIN.password}`);
	console.log(`  dev reporter: ${DEV_REPORTER.email} / ${DEV_REPORTER.password}`);
	console.log(`  late blight: ${LATE_BLIGHT.length}, cucurbit downy mildew: ${CDM.length}`);
	console.log(`  years: ${lastYear}, ${thisYear}`);
} finally {
	await client.end();
}
